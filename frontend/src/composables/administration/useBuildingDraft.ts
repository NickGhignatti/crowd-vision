import { DEFAULT_MAX_TEMPERATURE } from '@/utils/digital-twin/thresholds.ts'
import { ref, computed } from 'vue'
import { makeRequestWithRetry } from '@/composables/commons/useApi.ts'
import { useBuildingsStore } from '@/stores/digital-twin/buildings.ts'
import type {
  BuildingDraft,
  BuildingThresholdDraft,
  RoomDraft,
} from '@/types/administration/buildingDraft.ts'

const DEFAULT_THRESHOLDS: BuildingThresholdDraft = {
  minTemp: 18,
  maxTemp: DEFAULT_MAX_TEMPERATURE,
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

  const submit = async (domainName: string): Promise<void> => {
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

      // Every room's threshold goes in one request. As one request per room it was the
      // bulk of a registration's round trips, and a failure part-way left some rooms
      // written and the rest not, with nothing to say which.
      const roomThresholds = Object.fromEntries(
        draft.value.rooms.map((room) => [room.id, { maxPeople: room.thresholds.maxPeople }]),
      )

      // The three writes touch different metrics, so they overlap rather than queue.
      await Promise.all([
        makeRequestWithRetry(`/telemetry/thresholds/temperature/buildings/${buildingId}`, 'PATCH', {
          body: JSON.stringify({
            maxTemp: draft.value.thresholds.maxTemp,
            minTemp: draft.value.thresholds.minTemp,
          }),
        }),
        makeRequestWithRetry(`/telemetry/thresholds/airQuality/buildings/${buildingId}`, 'PATCH', {
          body: JSON.stringify({
            maxAqi: draft.value.thresholds.maxAqi,
            maxCo2: draft.value.thresholds.maxCo2,
          }),
        }),
        makeRequestWithRetry(
          `/telemetry/thresholds/peopleCount/buildings/${buildingId}/rooms`,
          'PATCH',
          { body: JSON.stringify(roomThresholds) },
        ),
      ])
    } finally {
      isSubmitting.value = false
    }
  }

  return { draft, hasData, isSubmitting, loadFromJson, updateBuilding, updateRoom, clear, submit }
}
