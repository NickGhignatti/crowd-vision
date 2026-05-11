import { ref, watchEffect, toValue } from 'vue'
import { makeExternalRequest } from '@/composables/core/useApi.ts'

const normalizeSimulatorUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `http://${trimmed}`
}

const getSimulatorUrls = (): string[] => {
  const envUrls = Object.entries(import.meta.env)
    .filter(([key, value]) => key.startsWith('VITE_SIMULATOR_URL') && typeof value === 'string')
    .map(([, value]) => normalizeSimulatorUrl(value))
    .filter((value) => value.length > 0)

  return envUrls
}

export function useIsRunning(buildingIdSource: any) {
  const isSimRunning = ref(false)
  const error = ref<string | null>(null)

  const refetch = async () => {
    const id = toValue(buildingIdSource)

    if (!id) {
      isSimRunning.value = false
      return
    }

    const simulatorUrls = getSimulatorUrls()
    if (simulatorUrls.length === 0) {
      isSimRunning.value = false
      return
    }

    try {
      const results = await Promise.all(
        simulatorUrls.map(async (url) => {
          try {
            const response = await makeExternalRequest(
              `${url}/control/status?buildingId=${id}`,
            )
            if (response.ok) {
              const data = await response.json()
              return data.isRunning === true
            }
          } catch (e) {
            console.error(`Failed to check status for ${url}`, e)
          }
          return false
        }),
      )

      isSimRunning.value = results.some((r) => r === true)
      error.value = null
    } catch (err: any) {
      error.value = err.message
      console.error(err)
    }
  }

  // Auto-runs when buildingIdSource changes
  watchEffect(() => {
    refetch()
  })

  return { isSimRunning, error, refetch }
}

export async function toggleSimulator(
  buildingId: string,
  action: 'start' | 'stop',
  rooms?: string[],
) {
  let serverUrl = import.meta.env.VITE_SERVER_URL
  if (!serverUrl) {
    serverUrl = window.location.origin
  }

  // Ensure no double-slashes by removing any trailing slash from serverUrl
  const cleanServerUrl = serverUrl.replace(/\/$/, '')
  const targetUrl = cleanServerUrl + '/sensor/'
  const simulatorUrls = getSimulatorUrls()

  if (action === 'start') {
    await Promise.all(
      simulatorUrls.map((url) => startSimulator(buildingId, url, targetUrl, rooms)),
    )
  } else {
    await Promise.all(simulatorUrls.map((url) => stopSimulator(buildingId, url)))
  }
}


const startSimulator = async (
  buildingId: string,
  simulatorUrl: string,
  targetUrl: string,
  rooms?: string[],
) => {
  try {
    const response = await makeExternalRequest(`${simulatorUrl}/control/start`, 'POST', {
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
    const response = await makeExternalRequest(`${simulatorUrl}/control/stop`, 'POST', {
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
