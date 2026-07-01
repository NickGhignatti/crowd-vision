import { ref, watchEffect } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'

export interface ApiDataPoint {
  timestamp: number
  value: number
}

export function getBuildingHistory(
  buildingId: any,
  range: any,
  apiType: 'peopleCount' | 'temperature' | 'airQuality',
  aggMode: any,
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
        `/sensor/${apiType}/dashboard?building=${buildingId.value}&timeRange=${range.value}&aggMode=${aggMode.value}`,
        'GET',
      )

      if (!response.ok) {
        error.value = 'Fetch failed'
        return
      }

      const result = await response.json()

      data.value = (result.data || []).map((d: any) => ({
        timestamp: d.timestamp,
        value: d.value ?? 0,
      }))
    } catch (err: any) {
      error.value = err.message
      console.error(err)
    } finally {
      isLoading.value = false
    }
  })

  return { data, isLoading, error }
}
