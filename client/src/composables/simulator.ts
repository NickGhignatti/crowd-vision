import { ref, watchEffect, toValue } from 'vue'
import { makeExternalRequest } from '@/composables/useApi'

const SIMULATOR_URL_STORAGE_KEY = 'simulatorUrl'

export function useIsRunning(buildingIdSource: any) {
  const isSimRunning = ref(false)
  const error = ref<string | null>(null)
  const lastSimulatorUrl = ref(
    localStorage.getItem(SIMULATOR_URL_STORAGE_KEY) || ''
  )

  const refetch = async (simulatorUrl: string) => {
    const id = toValue(buildingIdSource)
    if (simulatorUrl !== lastSimulatorUrl.value) {
      lastSimulatorUrl.value = simulatorUrl
      localStorage.setItem(SIMULATOR_URL_STORAGE_KEY, simulatorUrl)
    }
    if (!id || !simulatorUrl) {
      isSimRunning.value = false
      return
    }

    try {
      const response = await makeExternalRequest(`${simulatorUrl}/control/status/?buildingId=${id}`)
      if (!response.ok) {
        error.value = 'Fetch failed'
        isSimRunning.value = false
        return
      }

      const result = await response.json()
      isSimRunning.value = result.isRunning
      error.value = null
    } catch (err: any) {
      error.value = err.message
      console.error(err)
    }
  }

  // Auto-runs when buildingIdSource changes
  watchEffect(() => {
    refetch(lastSimulatorUrl.value)
  })

  return { isSimRunning, error, refetch }
}

export async function toggleSimulator(
  buildingId: string,
  action: 'start' | 'stop',
  simulatorUrl: string,
  rooms?: string[],
) {
  let serverUrl = import.meta.env.VITE_SERVER_URL
  if (!serverUrl) {
    serverUrl = window.location.origin
  }

  // Ensure no double-slashes by removing any trailing slash from serverUrl
  const cleanServerUrl = serverUrl.replace(/\/$/, '')

  if (action === 'start') {
    await startSimulator(buildingId, simulatorUrl, cleanServerUrl + '/sensor/', rooms)
  } else {
    await stopSimulator(buildingId, simulatorUrl)
  }
}

const startSimulator = async (
  buildingId: string,
  simulatorUrl: string,
  targetUrl: string,
  rooms?: string[],
) => {
  try {
    const response = await makeExternalRequest(`${simulatorUrl}/control/start/`, 'POST', {
      body: JSON.stringify({
        buildingId: buildingId,
        roomIds: rooms || [],
        targetUrl,
      }),
    })
    if (!response.ok) return

    await response.json()
  } catch (err: any) {
    console.error(err)
  }
}

const stopSimulator = async (buildingId: string, simulatorUrl: string) => {
  try {
    const response = await makeExternalRequest(`${simulatorUrl}/control/stop/`, 'POST', {
      body: JSON.stringify({
        buildingId: buildingId,
      }),
    })
    if (!response.ok) return

    await response.json()
  } catch (err: any) {
    console.error(err)
  }
}
