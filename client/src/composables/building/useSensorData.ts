import { ref, watch, type Ref } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import { socket } from '@/services/socket'

export interface ApiDataPoint {
  timestamp: string
  roomId: string
  value?: number
  building: string
  // Air Quality fields
  pm25?: number
  pm10?: number
  co2?: number
  voc?: number
  temperature?: number
  humidity?: number
  aqi?: number
  indoor_aqi?: number
  indoorAqi?: number
}

export function getBuildingData(
  buildingId: Ref<string | undefined>,
  apiType: 'peopleCount' | 'temperature' | 'airQuality',
  pollIntervalMs = 5000, // Configurable, defaults to 5 seconds
) {
  const data = ref<ApiDataPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  watch(
    buildingId,
    (newId, oldId, onCleanup) => {
      if (!newId) {
        data.value = []
        return
      }

      socket.emit('subscribe_building' as any, newId)

      let abortController: AbortController | null = null
      let intervalId: ReturnType<typeof setInterval>

      // Extracted fetch logic so we can call it immediately AND in the interval
      const fetchData = async (isBackgroundPoll = false) => {
        // Only show the loading state on the very first fetch
        if (!isBackgroundPoll) isLoading.value = true
        error.value = null

        // If a previous fetch is still running, kill it before starting a new one
        if (abortController) abortController.abort()
        abortController = new AbortController()

        try {
          const response = await makeRequest(
            `/sensor/${apiType}/entireBuilding?building=${newId}`,
            'GET',
            {
              signal: abortController.signal,
              credentials: 'omit',
            },
          )

          if (!response.ok) {
            error.value = 'Fetch failed'
            return
          }

          const result = await response.json()
          data.value = result.data || []
        } catch (err: any) {
          if (err.name === 'AbortError') return
          error.value = err.message
          console.error(`Polling error (${apiType}):`, err)
        } finally {
          if (!isBackgroundPoll) isLoading.value = false
        }
      }

      // 1. Fetch immediately on mount or ID change
      fetchData()

      // [OLD WAY]
      // // 2. Start the 5-second polling loop
      // intervalId = setInterval(() => {
      //   fetchData(true) // 'true' means it's a background poll, so don't show loading spinner
      // }, pollIntervalMs)

      socket.on(`telemetry` as any, (event: any) => {
        console.log('Received telemetry event:', event)
        if (event?.buildingId === buildingId.value && event?.type === apiType) {
          const newData = [...data.value]

          const idx = newData.findIndex(d => d.roomId === event.roomId)

          if (idx >= 0) {
            newData[idx] = { ...newData[idx], ...event }
          } else {
            newData.push(event)
          }

          data.value = newData
        }
      })


      // 3. Clean up interval and abort pending requests when component unmounts or ID changes
      onCleanup(() => {
        if (abortController) abortController.abort()
        socket.emit('unsubscribe_building' as any, newId)
        socket.off(`telemetry:filtered:${buildingId.value}` as any)
        // clearInterval(intervalId)
      })
    },
    { immediate: true },
  )

  return { data, isLoading, error }
}
