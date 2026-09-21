import { shallowRef } from 'vue'

import { makeRequest } from '@/composables/commons/useApi.ts'

// fetch has no timeout of its own, so a hung edge would leave the type picker empty forever.
const REQUEST_TIMEOUT_MS = 10_000

export interface SensorType {
  kind: string
  label: string
  unit?: string
}

// The catalog is the same for every building and view, so one fetch serves the whole session.
const types = shallowRef<SensorType[]>([])
const failed = shallowRef(false)
let loading: Promise<void> | null = null

async function load(): Promise<void> {
  try {
    const response = await makeRequest('/telemetry/contracts', 'GET', {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error('Failed to load sensor types')

    const body = await response.json()
    types.value = (body.metrics ?? []).map(({ kind, label, unit }: SensorType) => ({
      kind,
      label,
      unit,
    }))
    failed.value = false
  } catch {
    failed.value = true
    loading = null
  }
}

/** The sensor types telemetry accepts, as its own metric catalog lists them. */
export function useSensorTypes() {
  loading ??= load()

  const labelOf = (kind: string): string =>
    types.value.find((type) => type.kind === kind)?.label ?? kind

  return { types, failed, labelOf }
}
