import { ref, computed, watch } from 'vue'
import type { BuildingPayload } from '@/models/building'
import type { DomainMembership } from '@/models/domain'

export function useBuildingModel() {
  const serverUrl = import.meta.env.VITE_SERVER_URL

  const building = ref<BuildingPayload | null>(null)
  const allBuildings = ref<BuildingPayload[]>([]) // <--- This exists
  const selectedRoomId = ref<string | null>(null)
  const selectedFloor = ref<number | null>(null)
  const explodedRoomId = ref<string | null>(null)
  const isExploded = ref(false)

  const availableBuildingsNames = computed(() => allBuildings.value.map((b) => b.id))

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

  watch(building, (newValue) => {
    if (newValue) {
      selectedRoomId.value = null
      selectedFloor.value = null
      isExploded.value = false
      explodedRoomId.value = null
    }
  })

  const fetchBuildings = async () => {
    try {
      const username = localStorage.getItem('username')
      if (!username) return

      const domainRes = await fetch(`${serverUrl}/auth/domains/${username}`)
      const data = await domainRes.json()
      const memberships = data.domains as DomainMembership[]

      allBuildings.value = []

      for (const m of memberships) {
        if (!m.domainName) continue

        const buildingsRes = await fetch(`${serverUrl}/twin/buildings/${m.domainName}`)

        if (buildingsRes.ok) {
          const buildingsOfDomain = (await buildingsRes.json()) as BuildingPayload[]

          buildingsOfDomain.forEach((b: BuildingPayload) => {
            if (!allBuildings.value.some((existing) => existing.id === b.id)) {
              allBuildings.value.push(b)
            }
          })
        }
      }

      if (!building.value && allBuildings.value.length > 0) {
        building.value = allBuildings.value[0] || null
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
    allBuildings, // <--- ADD THIS HERE
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
