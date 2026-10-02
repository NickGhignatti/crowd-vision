import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { makeRequest } from '@/composables/commons/useApi.ts'
import { useBuildingReadings } from '@/composables/dashboard/useBuildingSensor.ts'
import {
  isStale,
  parseConnectedDevices,
  type ConnectedDevices,
} from '@/utils/dashboard/connectedDevices.ts'

const CLOCK_MS = 30_000

/** The selected building's connected devices, re-read from telemetry on every device report. */
export function useConnectedDevices(buildingId: Ref<string | undefined>) {
  const devices = shallowRef<ConnectedDevices | null>(null)
  const isLoading = ref(false)
  const now = ref(Date.now())
  // A report only signals "re-read": telemetry owns the sum, the browser never adds rooms.
  const { readings } = useBuildingReadings(
    buildingId,
    computed(() => ['totalDeviceCount']),
  )
  let inFlight: AbortController | null = null

  async function load(id: string) {
    inFlight?.abort()
    const abort = (inFlight = new AbortController())
    try {
      const url = `/telemetry/connected-devices/buildings/${encodeURIComponent(id)}`
      const response = await makeRequest(url, 'GET', { signal: abort.signal })
      if (response.status === 404) devices.value = null
      else if (!response.ok) throw new Error(`connected devices request failed: ${response.status}`)
      else devices.value = parseConnectedDevices(await response.json())
    } catch (error) {
      if (abort.signal.aborted) return
      console.error('[useConnectedDevices]', error)
      devices.value = null
    } finally {
      if (inFlight === abort) isLoading.value = false
    }
  }

  watch(
    buildingId,
    () => {
      devices.value = null
      isLoading.value = Boolean(buildingId.value)
    },
    { immediate: true },
  )
  watch(
    [buildingId, () => readings.value.totalDeviceCount],
    ([id]) => {
      if (id) void load(id)
    },
    { immediate: true },
  )

  // With no report arriving there is nothing to re-render on, so staleness needs its own clock.
  const clock = setInterval(() => (now.value = Date.now()), CLOCK_MS)
  onScopeDispose(() => {
    clearInterval(clock)
    inFlight?.abort()
  })

  return {
    devices,
    isLoading,
    stale: computed(() => devices.value !== null && isStale(devices.value, now.value)),
  }
}
