import { shallowRef, triggerRef, ref, watch, type Ref } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import { socket } from '@/services/socket'
import type { SensorDraftType } from '@/models/buildingDraft.ts'

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

export interface RoomSensorRecord {
  buildingId: string
  roomId: string
  sensorId: string
  sensorType: SensorDraftType | string
}

export function getBuildingData(
  buildingId: Ref<string | undefined>,
  apiType: 'peopleCount' | 'temperature' | 'airQuality',
) {
  // shallowRef avoids deep reactivity on array contents — mutations are surfaced
  // manually via triggerRef, keeping Vue's scheduler out of the Three.js RAF loop.
  const data = shallowRef<ApiDataPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  watch(
    buildingId,
    (newId, _oldId, onCleanup) => {
      if (!newId) {
        data.value = []
        return
      }

      socket.emit('subscribe_building' as any, newId)

      let abortController: AbortController | null = null
      let rafPending = false

      const fetchData = async (isBackgroundPoll = false) => {
        if (!isBackgroundPoll) isLoading.value = true
        error.value = null

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

      fetchData()

      // Captured reference ensures socket.off() removes exactly this handler,
      // not a different listener registered by another composable instance.
      const telemetryHandler = (event: any) => {
        if (event?.buildingId !== buildingId.value || event?.type !== apiType) return

        const arr = data.value
        const idx = arr.findIndex(d => d.roomId === event.roomId)
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...event }
        } else {
          arr.push(event)
        }

        // Batch DOM/VNode updates to the next animation frame so Vue's scheduler
        // does not interrupt the Three.js render loop mid-frame.
        if (!rafPending) {
          rafPending = true
          requestAnimationFrame(() => {
            triggerRef(data)
            rafPending = false
          })
        }
      }

      socket.on('telemetry' as any, telemetryHandler)

      onCleanup(() => {
        if (abortController) abortController.abort()
        socket.emit('unsubscribe_building' as any, newId)
        socket.off('telemetry' as any, telemetryHandler)
      })
    },
    { immediate: true },
  )

  return { data, isLoading, error }
}

export function useBuildingSensors(buildingId: Ref<string | undefined>) {
  const sensors = shallowRef<RoomSensorRecord[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const refresh = async () => {
    if (!buildingId.value) {
      sensors.value = []
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const response = await makeRequest(
        `/sensor/sensors/buildings/${buildingId.value}`,
      )

      if (!response.ok) {
        throw new Error('Fetch failed')
      }

      const result = await response.json()
      sensors.value = result.data || []
    } catch (err: any) {
      error.value = err.message
      console.error('Room sensor fetch error:', err)
    } finally {
      isLoading.value = false
    }
  }

  const registerSensor = async (payload: {
    roomId: string
    sensorId: string
    sensorType: SensorDraftType
  }) => {
    if (!buildingId.value) return

    const response = await makeRequest('/sensor/sensor', 'POST', {
      body: JSON.stringify({
        sensorData: {
          buildingId: buildingId.value,
          roomId: payload.roomId,
          sensorId: payload.sensorId,
          sensorType: payload.sensorType,
        },
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to register sensor')
    }

    await refresh()
  }

  const sendAction = async (payload: {
    roomId: string
    sensorId: string
    sensorType: string
    actionName: string
    actionArguments: string[]
  }) => {
    if (!buildingId.value) return
    console.log(payload)

    const response = await makeRequest('/sensor/executeAction', 'POST', {
      body: JSON.stringify({
        actionData: {
          buildingId: buildingId.value,
          roomId: payload.roomId,
          sensorId: payload.sensorId,
          sensorType: payload.sensorType,
          timestamp: Date.now(),
          actionName: payload.actionName,
          actionArguments: payload.actionArguments,
        },
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to register sensor')
    }
  }

  watch(
    buildingId,
    async (newId) => {
      if (!newId) {
        sensors.value = []
        return
      }

      await refresh()
    },
    { immediate: true },
  )

  return { sensors, isLoading, error, refresh, registerSensor, sendAction }
}
