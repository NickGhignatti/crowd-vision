import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { makeRequest } from '@/composables/commons/useApi.ts'

// fetch has no timeout of its own, so a hung edge would leave the device picker empty forever.
const REQUEST_TIMEOUT_MS = 10_000

/** A kind of physical device a sensor is registered as, and the metrics it reports. */
export interface DeviceKind {
  kind: string
  label: string
  metrics: string[]
}

// The catalog is the same for every building and view, so one fetch serves the whole session.
const kinds = shallowRef<DeviceKind[]>([])
const failed = shallowRef(false)
let loading: Promise<void> | null = null

async function load(): Promise<void> {
  try {
    const response = await makeRequest('/telemetry/devices', 'GET', {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error('Failed to load device kinds')

    const body = await response.json()
    kinds.value = body.devices ?? []
    failed.value = false
  } catch {
    failed.value = true
    loading = null
  }
}

/** The device kinds telemetry accepts; a kind the frontend has no translation for keeps the server's label. */
export function useDeviceKinds() {
  const { t, te } = useI18n()
  loading ??= load()

  const labelOf = (kind: string): string => {
    const key = `model.sensors.devices.${kind}`
    if (te(key)) return t(key)
    return kinds.value.find((device) => device.kind === kind)?.label ?? kind
  }

  return { kinds, failed, labelOf }
}
