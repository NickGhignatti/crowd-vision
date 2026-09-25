import { ref, watchEffect, toValue, type MaybeRefOrGetter } from 'vue'
import { makeRequest } from '@/composables/commons/useApi.ts'

// fetch has no timeout of its own, and telemetry waits up to 5 s on each simulator.
const REQUEST_TIMEOUT_MS = 10_000

const simulationUrl = (buildingId: string) =>
  `/telemetry/simulation/buildings/${encodeURIComponent(buildingId)}`

export function useIsRunning(buildingIdSource: MaybeRefOrGetter<string | undefined>) {
  const isSimRunning = ref(false)
  const error = ref<string | null>(null)

  const refetch = async () => {
    const id = toValue(buildingIdSource)
    if (!id) {
      isSimRunning.value = false
      return
    }

    try {
      const response = await makeRequest(simulationUrl(id), 'GET', {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`Simulation status failed (${response.status})`)
      const body = await response.json()
      isSimRunning.value = body.running === true
      error.value = null
    } catch (err) {
      isSimRunning.value = false
      error.value = err instanceof Error ? err.message : 'Simulation status failed'
    }
  }

  watchEffect(() => {
    refetch()
  })

  return { isSimRunning, error, refetch }
}

/** Starts simulating the building's current sensors, or stops; telemetry picks the simulators. */
export async function toggleSimulator(buildingId: string, action: 'start' | 'stop') {
  const response = await makeRequest(
    simulationUrl(buildingId),
    action === 'start' ? 'PUT' : 'DELETE',
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  )
  if (!response.ok) throw new Error(`Simulator ${action} failed (${response.status})`)
}
