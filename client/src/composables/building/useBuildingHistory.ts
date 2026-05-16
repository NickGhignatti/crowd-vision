import { ref, watchEffect } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'

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
  apiType: 'peopleCount' | 'temperature' | 'airQuality',
) {
  const data = ref<ApiDataPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  watchEffect(async () => {
    if (!buildingId.value) return

    isLoading.value = true
    data.value = []
    error.value = null

    try {
      const response = await makeRequest(
        `/sensor/${apiType}/dashboard?building=${buildingId.value}&timeRange=${range.value}`,
        'GET',
        {
          credentials: 'omit',
        },
      )

      if (!response.ok) {
        error.value = 'Fetch failed'
        return
      }

      const result = await response.json()

      const valueKey =
        apiType === 'temperature'
          ? 'temperature'
          : apiType === 'peopleCount'
            ? 'peopleCount'
            : 'indoor_aqi'

      data.value = (result.data || []).map((d: any) => ({
        timestamp: d.timestamp,
        value: d[valueKey] ?? 0,
      }))
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
