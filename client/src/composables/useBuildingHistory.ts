import { ref, watchEffect } from 'vue'

export interface ApiDataPoint {
  timestamp: string
  avg: number
  max: number
  min: number
  sum: number
}

export function getBuildingHistory(
  buildingId: any,
  range: any,
  apiType: 'peopleCount' | 'temperature',
) {
  const data = ref<ApiDataPoint[]>([])
  const isLoading = ref(false)
  const error = ref(null)
  const serverUrl = import.meta.env.VITE_SERVER_URL

  watchEffect(async () => {
    if (!buildingId.value) return

    isLoading.value = true
    data.value = []
    error.value = null

    try {
      const response = await fetch(
        `${serverUrl}/sensor/${apiType}/dashboard/entireBuilding/?building=${buildingId.value}&timeRange=${range.value}`,
      )

      if (!response.ok) throw new Error('Fetch failed')

      const result = await response.json()
      console.log('Fetched data:', result)

      data.value = result[apiType] || []
    } catch (err: any) {
      error.value = err.message
      // Fallback to empty or mock on error if strictly needed
      console.error(err)
    } finally {
      isLoading.value = false
    }
  })

  return { data, isLoading, error }
}
