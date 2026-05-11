import { ref, computed, watch } from 'vue'
import type { Building } from '@/models/building.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { makeRequest } from '@/composables/core/useApi.ts'

const DEFAULT_MAX_TEMPERATURE = 27

type ThresholdClone = {
  buildingId: string
  maxTemperature?: number
  rooms?: Array<{ id: string; name?: string; maxTemperature?: number }>
}

const mergeThresholdClone = (building: Building, threshold: ThresholdClone | null): Building => {
  const buildingMaxTemperature =
    typeof threshold?.maxTemperature === 'number'
      ? threshold.maxTemperature
      : typeof building.maxTemperature === 'number'
        ? building.maxTemperature
        : DEFAULT_MAX_TEMPERATURE

  const roomThresholds = new Map((threshold?.rooms ?? []).map((room) => [room.id, room]))

  return {
    ...building,
    maxTemperature: buildingMaxTemperature,
    rooms: building.rooms.map((room) => {
      const thresholdRoom = roomThresholds.get(room.id)
      return {
        ...room,
        maxTemperature:
          typeof thresholdRoom?.maxTemperature === 'number'
            ? thresholdRoom.maxTemperature
            : typeof room.maxTemperature === 'number'
              ? room.maxTemperature
              : buildingMaxTemperature,
      }
    }),
  }
}

const hydrateBuildingThresholds = async (buildings: Building[]) => {
  return Promise.all(
    buildings.map(async (candidate) => {
      try {
        const response = await makeRequest(
          `/sensor/thresholds/buildings/${encodeURIComponent(candidate.id)}`,
        )

        if (!response.ok) {
          return mergeThresholdClone(candidate, null)
        }

        const threshold = (await response.json()) as ThresholdClone | null
        return mergeThresholdClone(candidate, threshold)
      } catch {
        return mergeThresholdClone(candidate, null)
      }
    }),
  )
}

interface BuildingOption {
  id: string
  name: string
}

export function useBuildingModel() {
  const domainsStore = useDomainsStore()
  const buildingsStore = useBuildingsStore()

  const isExploded = ref(false)
  const selectedRoomId = ref<string | null>(null)
  const explodedRoomId = ref<string | null>(null)
  const allBuildings = ref<Building[]>([])
  const selectedFloor = ref<number | null>(null)
  const building = ref<Building | null>(null)

  watch(building, (newValue) => {
    if (newValue) {
      selectedRoomId.value = null
      selectedFloor.value = null
      isExploded.value = false
      explodedRoomId.value = null
    }
  })

  const availableBuildingsNames = computed<BuildingOption[]>(() =>
    allBuildings.value.map((b) => ({
      id: b.id,
      name: b.name?.trim() || b.id,
    })),
  )

  const visibleRooms = computed(() => {
    if (!building.value) return []
    let rooms = building.value.rooms

    if (selectedFloor.value !== null) {
      rooms = rooms.filter((r) => r.position.y === selectedFloor.value)
    }

    if (isExploded.value && explodedRoomId.value) {
      const target = building.value.rooms.find((r) => r.id === explodedRoomId.value)
      if (target) {
        rooms = rooms.filter(
          (r) =>
            r.position.y >= target.position.y &&
            r.position.x >= target.position.x &&
            r.position.z >= target.position.z &&
            r.position.y + r.dimensions.height <= target.position.y + target.dimensions.height &&
            r.position.x + r.dimensions.width <= target.position.x + target.dimensions.width &&
            r.position.z + r.dimensions.depth <= target.position.z + target.dimensions.depth,
        )
      }
    }
    return rooms
  })

  const displayedBuilding = computed(() => {
    if (!building.value) return null
    return { ...building.value, rooms: visibleRooms.value }
  })

  const fetchBuildings = async () => {
    try {
      await domainsStore.fetchMemberships()
      if (!domainsStore.memberships) return

      await buildingsStore.fetch(domainsStore.memberships)

      const hydratedBuildings = await hydrateBuildingThresholds(buildingsStore.all)
      allBuildings.value = hydratedBuildings

      if (building.value) {
        const refreshedBuilding = hydratedBuildings.find((candidate) => candidate.id === building.value?.id)
        if (refreshedBuilding) {
          Object.assign(building.value, refreshedBuilding)
        }
      }

      if (!building.value && allBuildings.value.length > 0) {
        building.value = allBuildings.value[0] ?? null
      }
    } catch (e) {
      console.error('Error fetching building schema:', e)
    }
  }

  const setBuildingByIndex = (index: number) => {
    building.value = allBuildings.value[index] || null
  }

  const toggleRoom = (id: string) => {
    selectedRoomId.value = selectedRoomId.value === id ? null : id
  }

  const setFloor = (floorY: number | null) => {
    selectedFloor.value = floorY
    selectedRoomId.value = null
  }

  return {
    building,
    allBuildings,
    availableBuildingsNames,
    selectedRoomId,
    selectedFloor,
    explodedRoomId,
    isExploded,
    visibleRooms,
    displayedBuilding,
    fetchBuildings,
    setBuildingByIndex,
    toggleRoom,
    setFloor,
  }
}
