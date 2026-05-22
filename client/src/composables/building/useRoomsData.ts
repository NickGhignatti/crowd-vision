import { computed, type Ref } from 'vue'
import { getBuildingData, type ApiDataPoint } from './useSensorData.ts'

function useRoomAverages(sensorData: Ref<ApiDataPoint[]>) {
  return computed(() => {
    if (!sensorData.value || sensorData.value.length === 0) return {}

    const stats = new Map<string, { sum: number; count: number }>()

    for (let i = 0; i < sensorData.value.length; i++) {
      const pt = sensorData.value[i]
      if (pt && pt.value !== undefined) {
        const existing = stats.get(pt.roomId)
        if (existing) {
          existing.sum += pt.value
          existing.count++
        } else {
          stats.set(pt.roomId, { sum: pt.value, count: 1 })
        }
      }
    }

    const averages: Record<string, number> = {}
    stats.forEach((val, roomId) => {
      averages[roomId] = val.sum / val.count
    })

    return averages
  })
}

export function useBuildingTemperature(buildingId: Ref<string | undefined>) {
  const { data, isLoading, error } = getBuildingData(buildingId, 'temperature')

  const averages = useRoomAverages(data)

  return {
    temperatures: averages,
    isLoading,
    error,
  }
}

export function useBuildingAirQualitySensors(buildingId: Ref<string | undefined>) {
  const { data, isLoading, error } = getBuildingData(buildingId, 'airQuality')

  const indoorAqi = computed(() => {
    const results: Record<string, number> = {}
    if (!data.value) return results

    data.value.forEach((pt) => {
      const val = pt.indoor_aqi ?? pt.indoorAqi
      if (val != null) {
        results[pt.roomId] = val
      }
    })
    return results
  })

  return {
    indoorAqi,
    isLoading,
    error,
  }
}
