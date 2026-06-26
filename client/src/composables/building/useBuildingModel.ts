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

// Module-level threshold cache with a 5-minute TTL. Thresholds change rarely
// (admin action), so re-fetching on every page navigation wastes N parallel
// requests at dashboard open time.
const thresholdCache = new Map<string, { data: ThresholdClone | null; expiresAt: number }>()
const THRESHOLD_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Test-only helper. Clears the module-level threshold cache so that
 * `fetchBuildings()` re-requests thresholds from scratch. Production code
 * must not depend on this — relying on the 5-minute TTL is the contract.
 */
export const __resetThresholdCacheForTests = () => {
  thresholdCache.clear()
}

const hydrateBuildingThresholds = async (buildings: Building[]) => {
  const now = Date.now()
  return Promise.all(
    buildings.map(async (candidate) => {
      const cached = thresholdCache.get(candidate.id)
      if (cached && cached.expiresAt > now) {
        return mergeThresholdClone(candidate, cached.data)
      }

      try {
        const response = await makeRequest(
          `/sensor/thresholds/buildings/${encodeURIComponent(candidate.id)}`,
        )

        if (!response.ok) {
          thresholdCache.set(candidate.id, { data: null, expiresAt: now + THRESHOLD_CACHE_TTL_MS })
          return mergeThresholdClone(candidate, null)
        }

        const threshold = (await response.json()) as ThresholdClone | null
        thresholdCache.set(candidate.id, { data: threshold, expiresAt: now + THRESHOLD_CACHE_TTL_MS })
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
  domains: string[]
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
      domains: b.domains ?? [],
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

  // Select by id, not list position: the sidebar groups/filters buildings, so a
  // visible-list index no longer maps onto the underlying allBuildings order.
  const setBuildingById = (id: string) => {
    building.value = allBuildings.value.find((b) => b.id === id) || null
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
    setBuildingById,
    toggleRoom,
    setFloor,
  }
}
