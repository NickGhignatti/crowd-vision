import { defineStore } from 'pinia'
import { shallowRef, ref, type ShallowRef, type Ref } from 'vue'
import { socket } from '@/services/socket'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { ApiDataPoint } from '@/composables/building/useSensorData.ts'

export type SensorType = 'peopleCount' | 'temperature' | 'airQuality'

export interface SensorBucket {
  data: ShallowRef<ApiDataPoint[]>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  refCount: number
  abort: AbortController | null
}

const bucketKey = (type: SensorType, buildingId: string) => `${type}:${buildingId}`
const buildingOf = (key: string) => key.slice(key.indexOf(':') + 1)

/** Single source of truth for live sensor data, keyed by (type, building), shared and
 * reference-counted across components; a *setup* store with shallowRefs since data isn't deeply reactive. */
export const useSensorDataStore = defineStore('sensorData', () => {
  const buckets = new Map<string, SensorBucket>()
  const dirty = new Set<string>()
  let rafPending = false

  // A building's socket room lives exactly as long as it has ≥1 bucket, so the
  // room lifecycle is derived from bucket presence — no separate counter to sync.
  const hasBucketForBuilding = (buildingId: string) =>
    [...buckets.keys()].some((key) => buildingOf(key) === buildingId)

  function onTelemetry(rawEvent: unknown) {
    // Telemetry events identify their building as `buildingId` (the REST shape
    // uses `building`); the bucket key is the building id passed to `acquire`.
    const event = rawEvent as ApiDataPoint & { type?: SensorType; buildingId?: string }
    const key = bucketKey(event?.type as SensorType, event?.buildingId as string)
    const bucket = buckets.get(key)
    if (!bucket) return

    const arr = bucket.data.value
    const idx = arr.findIndex((d) => d.roomId === event.roomId)
    if (idx >= 0) arr[idx] = { ...arr[idx], ...event }
    else arr.push(event)

    dirty.add(key)
    scheduleFlush()
  }

  // Coalesce every bucket touched this frame into one reactive update, swapping in a fresh
  // array reference — Vue ≥3.4 only re-notifies computed dependents on identity change, not in-place mutation.
  function scheduleFlush() {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      for (const key of dirty) {
        const bucket = buckets.get(key)
        if (bucket) bucket.data.value = bucket.data.value.slice()
      }
      dirty.clear()
      rafPending = false
    })
  }

  // On reconnect the server forgot our building rooms — rejoin and refetch so we
  // recover any telemetry missed while disconnected.
  function onReconnect() {
    for (const buildingId of new Set([...buckets.keys()].map(buildingOf))) {
      socket.emit('subscribe_building', buildingId)
    }
    for (const [key, bucket] of buckets) {
      void fetchBucket(key.slice(0, key.indexOf(':')) as SensorType, buildingOf(key), bucket)
    }
  }

  async function fetchBucket(type: SensorType, buildingId: string, bucket: SensorBucket) {
    bucket.abort?.abort()
    bucket.abort = new AbortController()
    bucket.isLoading.value = true
    bucket.error.value = null
    try {
      const res = await makeRequest(
        `/sensor/${type}/entireBuilding?building=${buildingId}`,
        'GET',
        { signal: bucket.abort.signal },
      )
      if (!res.ok) {
        bucket.error.value = 'Fetch failed'
        return
      }
      bucket.data.value = (await res.json()).data || []
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') bucket.error.value = (err as Error).message
    } finally {
      bucket.isLoading.value = false
    }
  }

  /** Subscribe to a building's metric: the first caller sets up the bucket (joining the room
   *  if it's the first metric for that building); the rest share it. Always pair with `release`. */
  function acquire(buildingId: string, type: SensorType): SensorBucket {
    const key = bucketKey(type, buildingId)
    let bucket = buckets.get(key)
    if (!bucket) {
      const firstForBuilding = !hasBucketForBuilding(buildingId)
      bucket = {
        data: shallowRef<ApiDataPoint[]>([]),
        isLoading: ref(false),
        error: ref<string | null>(null),
        refCount: 0,
        abort: null,
      }
      buckets.set(key, bucket)
      if (firstForBuilding) socket.emit('subscribe_building', buildingId)
      void fetchBucket(type, buildingId, bucket)
    }
    bucket.refCount++
    return bucket
  }

  /** Drop one reference. The last release of a bucket tears it down; once a
   *  building has no buckets left, we leave its socket room. */
  function release(buildingId: string, type: SensorType) {
    const key = bucketKey(type, buildingId)
    const bucket = buckets.get(key)
    if (bucket && --bucket.refCount <= 0) {
      bucket.abort?.abort()
      buckets.delete(key)
    }
    if (!hasBucketForBuilding(buildingId)) socket.emit('unsubscribe_building', buildingId)
  }

  // Single global handlers, installed once — Pinia instantiates the store lazily,
  // so `setup` runs exactly when (and only if) the store is first used.
  socket.on('telemetry', onTelemetry)
  socket.on('connect', onReconnect)

  return { acquire, release }
})
