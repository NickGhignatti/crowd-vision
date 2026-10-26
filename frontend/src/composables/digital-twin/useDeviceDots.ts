import { onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

import { socket } from '@/services/socket'
import { useSensorDataStore } from '@/stores/commons/sensorData.ts'
import { isStale, parseDevices } from '@/utils/digital-twin/devices.ts'
import type { Device, Devices } from '@/utils/digital-twin/devices.ts'

// How often a held tick is checked for age; well under the 30 s it may live.
const STALE_CHECK_MS = 5_000

/** The newest devices twin placed in a building, live only while `active`. */
export function useDeviceDots(buildingId: Ref<string | undefined>, active: Ref<boolean>) {
  const store = useSensorDataStore()
  const latest = shallowRef<Devices | null>(null)
  const devices = shallowRef<Device[]>([])

  const show = (next: Devices | null) => {
    latest.value = next
    devices.value = next?.devices ?? []
  }

  const onDevices = (raw: unknown) => {
    let next: Devices
    try {
      next = parseDevices(raw)
    } catch {
      return
    }
    // An older tick arriving late would move every dot backwards.
    if (next.buildingId !== buildingId.value || isStale(next, Date.now())) return
    if (latest.value && next.tick <= latest.value.tick) return
    show(next)
  }

  // A collector that stops leaves its last tick behind; past the cutoff it is cleared, not frozen.
  const timer = setInterval(() => {
    if (latest.value && isStale(latest.value, Date.now())) show(null)
  }, STALE_CHECK_MS)

  watch(
    [buildingId, active],
    ([id, on], _previous, onCleanup) => {
      show(null)
      if (!id || !on) return
      store.holdRoom(id)
      socket.on('devices', onDevices)
      onCleanup(() => {
        socket.off('devices', onDevices)
        store.releaseRoom(id)
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => clearInterval(timer))

  return { devices }
}
