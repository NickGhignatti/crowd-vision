import { ref, computed } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import type {
  BuildingDraft,
  BuildingThresholdDraft,
  RoomDraft,
  SensorRegistrationDraft,
} from '@/models/buildingDraft.ts'

const DEFAULT_THRESHOLDS: BuildingThresholdDraft = {
  minTemp: 18,
  maxTemp: 27,
  maxAqi: 75,
  maxCo2: 1000,
}

export function useBuildingDraft() {
  const buildingsStore = useBuildingsStore()
  const draft = ref<BuildingDraft | null>(null)
  const isSubmitting = ref(false)
  const hasData = computed(() => draft.value !== null)

  const loadFromJson = (raw: any): void => {
    draft.value = {
      name: raw.name?.trim() || '',
      thresholds: { ...DEFAULT_THRESHOLDS },
      rooms: (raw.rooms ?? []).map((room: any) => ({
        id: room.id,
        name: room.name?.trim() || room.id,
        capacity: room.capacity ?? 0,
        position: room.position,
        dimensions: room.dimensions,
        color: room.color,
        thresholds: {
          ...DEFAULT_THRESHOLDS,
          maxPeople: room.capacity ?? 0,
        },
      })),
    }
  }

  const updateBuilding = (patch: Partial<Omit<BuildingDraft, 'rooms'>>): void => {
    if (!draft.value) return
    Object.assign(draft.value, patch)
  }

  const updateRoom = (roomId: string, patch: Partial<RoomDraft>): void => {
    if (!draft.value) return
    const room = draft.value.rooms.find((r) => r.id === roomId)
    if (room) Object.assign(room, patch)
  }

  const clear = (): void => {
    draft.value = null
  }

  const submit = async (
    domainName: string,
    sensorsToRegister: SensorRegistrationDraft[] = [],
  ): Promise<void> => {
    if (!draft.value) return
    isSubmitting.value = true

    try {
      const twinPayload = {
        name: draft.value.name,
        rooms: draft.value.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          position: r.position,
          dimensions: r.dimensions,
          color: r.color,
        })),
      }

      const buildingId = await buildingsStore.register(twinPayload, domainName)

      await makeRequest(`/sensor/thresholds/temperature/buildings/${buildingId}`, 'PATCH', {
        body: JSON.stringify({
          maxTemp: draft.value.thresholds.maxTemp,
          minTemp: draft.value.thresholds.minTemp,
        }),
      })

      await makeRequest(`/sensor/thresholds/airQuality/buildings/${buildingId}`, 'PATCH', {
        body: JSON.stringify({
          maxAqi: draft.value.thresholds.maxAqi,
          maxCo2: draft.value.thresholds.maxCo2,
        }),
      })

      await Promise.all(
        draft.value.rooms.map((room) =>
          makeRequest(
            `/sensor/thresholds/peopleCount/buildings/${buildingId}/rooms/${room.id}`,
            'PATCH',
            { body: JSON.stringify({ maxPeople: room.thresholds.maxPeople }) },
          ),
        ),
      )

      await Promise.all(
        sensorsToRegister.map(async (sensor) => {
          const registerResponse = await makeRequest('/sensor/sensor', 'POST', {
            body: JSON.stringify({
              sensorData: {
                buildingId,
                roomId: sensor.roomId,
                sensorType: sensor.sensorType,
                sensorId: sensor.sensorId,
              },
            }),
          })

          if (!registerResponse.ok) {
            throw new Error('Failed to register sensor')
          }

          const actionPayload = {
            sensorType: sensor.sensorType,
            buildingId,
            roomId: sensor.roomId,
            timestamp: Date.now(),
            temperature: draft.value?.thresholds.minTemp ?? 0,
          }

          const actionResponse = await makeRequest('/sensor/executeAction', 'POST', {
            body: JSON.stringify({ actionData: actionPayload }),
          })

          if (!actionResponse.ok) {
            throw new Error('Failed to execute sensor action')
          }
        }),
      )
    } finally {
      isSubmitting.value = false
    }
  }

  return { draft, hasData, isSubmitting, loadFromJson, updateBuilding, updateRoom, clear, submit }
}
