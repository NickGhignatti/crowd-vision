import { ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

import { makeRequest } from '@/composables/commons/useApi.ts'
import type { Sensor } from '@/types/digital-twin/sensor.ts'
import type { TelemetryBatch } from '@/utils/digital-twin/sensorDraft.ts'

// fetch has no timeout of its own, so a hung edge would leave a save spinning forever.
const REQUEST_TIMEOUT_MS = 10_000

export interface RejectedItem {
  ref: string
  field: string
  message: string
}

/** A batch telemetry refused item by item; nothing was written. */
export class SensorBatchRejected extends Error {
  constructor(readonly items: RejectedItem[]) {
    super(`${items.length} item(s) rejected`)
    this.name = 'SensorBatchRejected'
  }
}

const isEmpty = (batch: TelemetryBatch) =>
  batch.create.length === 0 && batch.update.length === 0 && batch.delete.length === 0

export function useSensors(buildingId: Ref<string | undefined>) {
  const sensors = shallowRef<Sensor[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const refresh = async (): Promise<void> => {
    if (!buildingId.value) {
      sensors.value = []
      return
    }

    isLoading.value = true
    error.value = null
    try {
      const response = await makeRequest(
        `/telemetry/sensors/buildings/${buildingId.value}`,
        'GET',
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      )
      if (!response.ok) throw new Error('Failed to load sensors')

      const body = await response.json()
      sensors.value = body.data ?? []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load sensors'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /** Saves one batch and returns the id telemetry generated for each create item's `ref`. */
  const save = async (batch: TelemetryBatch): Promise<Record<string, string>> => {
    if (!buildingId.value || isEmpty(batch)) return {}

    const response = await makeRequest(`/telemetry/sensors/buildings/${buildingId.value}`, 'POST', {
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.status === 422) {
      const body = await response.json()
      throw new SensorBatchRejected(body.errors ?? [])
    }
    if (!response.ok) throw new Error('Failed to save sensors')

    const body = await response.json()
    return Object.fromEntries(
      (body.created ?? []).map((created: { ref: string; sensorId: string }) => [
        created.ref,
        created.sensorId,
      ]),
    )
  }

  watch(buildingId, () => void refresh().catch(() => {}), { immediate: true })

  return { sensors, isLoading, error, refresh, save }
}
