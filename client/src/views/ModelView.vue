<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue' // Added computed
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { Vector3 } from 'three'
import NavBar from '@/components/NavBar.vue'
import LeftMenu from '@/components/menus/LeftMenu.vue'
import RightMenu from '@/components/menus/RightMenu.vue'
import type { BuildingPayload } from '@/scripts/schema.ts'

const serverUrl = import.meta.env.VITE_SERVER_URL

interface TresEvent {
  stopPropagation: () => void
}

const buildingRef = ref<BuildingPayload | null>(null)
const selectedRoomId = ref<string | null>(null)
// NEW: State for the selected floor (null means all floors visible)
const selectedFloor = ref<number | null>(null)

let allAvailableBuildings: BuildingPayload[] = []
const availableBuildingsNames = ref<string[]>([])

const cameraRef = ref()
const controlsRef = ref()

watch(
  () => buildingRef.value,
  (newValue) => {
    if (newValue) {
      selectedRoomId.value = null
      selectedFloor.value = null // Reset floor selection when changing building
    }
  },
)

// NEW: Computed property to get only rooms on the selected floor
const visibleRooms = computed(() => {
  if (!buildingRef.value) return []
  if (selectedFloor.value === null) return buildingRef.value.rooms

  // Filter rooms that match the selected Y coordinate
  return buildingRef.value.rooms.filter((r) => r.position.y === selectedFloor.value)
})

// NEW: Computed property to pass a "filtered building" to RightMenu
// This ensures the list on the right only shows rooms for the current floor
const displayedBuilding = computed(() => {
  if (!buildingRef.value) return null
  return {
    ...buildingRef.value,
    rooms: visibleRooms.value,
  }
})

const requestBuildingSchema = async () => {
  try {
    const userDomain = (
      await fetch(serverUrl + '/auth/domain/' + localStorage.getItem('username')).then((response) =>
        response.json(),
      )
    ).domain.name as string

    const response = await fetch(serverUrl + '/twin/buildings/' + userDomain)
    if (!response.ok) throw new Error('Failed to fetch')
    allAvailableBuildings = (await response.json()) as BuildingPayload[]
    availableBuildingsNames.value = allAvailableBuildings.map((b) => b.id)
    if (!buildingRef.value && allAvailableBuildings.length > 0) {
      buildingRef.value = allAvailableBuildings[0] || null
    }
  } catch (e) {
    console.error(e)
  }
}

const changeBuildingSchema = (currentIndex: number) => {
  buildingRef.value = allAvailableBuildings[currentIndex] || null
}

const handleRoomToggle = (id: string) => {
  selectedRoomId.value = selectedRoomId.value === id ? null : id
}

// NEW: Handler for floor changes from LeftMenu
const handleFloorChange = (floorY: number | null) => {
  selectedFloor.value = floorY
  selectedRoomId.value = null // Deselect room when switching floors
}

const onRoomClick = (id: string, event: TresEvent) => {
  if (event && event.stopPropagation) event.stopPropagation()
  handleRoomToggle(id)
}

onMounted(() => {
  requestBuildingSchema()
})

const resetView = () => {
  if (cameraRef.value && controlsRef.value) {
    cameraRef.value.position.set(10, 10, 10)
    controlsRef.value.value.target.set(0, 0, 0)
    controlsRef.value.value.update()
  }
}

const zoomIn = () => {
  if (!cameraRef.value) return
  const direction = new Vector3()
  cameraRef.value.getWorldDirection(direction)
  cameraRef.value.position.addScaledVector(direction, 2)
}

const zoomOut = () => {
  if (!cameraRef.value) return
  const direction = new Vector3()
  cameraRef.value.getWorldDirection(direction)
  cameraRef.value.position.addScaledVector(direction, -2)
}
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <LeftMenu
        :structure-ids="availableBuildingsNames"
        :selected-id="buildingRef?.id || null"
        :building="buildingRef"
        :active-floor="selectedFloor"
        @json-uploaded="requestBuildingSchema"
        @change-building="changeBuildingSchema"
        @change-floor="handleFloorChange"
      />

      <main class="flex-1 relative bg-slate-50 z-0 min-w-0">
        <TresCanvas clear-color="#f8fafc" window-size shadows>
          <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
          <OrbitControls ref="controlsRef" make-default :damping-factor="0.05" />

          <TresAmbientLight :intensity="0.6" />
          <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" cast-shadow />

          <template v-if="buildingRef">
            <TresMesh
              v-for="room in visibleRooms"
              :key="room.id"
              :position="[room.position.x, room.position.y, room.position.z]"
              @click="(ev) => onRoomClick(room.id, ev)"
            >
              <TresBoxGeometry
                :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
              />
              <TresMeshStandardMaterial
                :color="room.id === selectedRoomId ? '#10b981' : '#e2e8f0'"
                :transparent="true"
                :opacity="room.id === selectedRoomId ? 0.6 : 0.3"
                :depth-write="false"
              />
            </TresMesh>
          </template>
        </TresCanvas>

        <div
          class="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-slate-200/50 z-10"
        >
          <button
            @click="resetView"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Reset View"
          >
            <i class="ph-bold ph-cube text-xl"></i>
          </button>
          <button
            @click="zoomIn"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Zoom In"
          >
            <i class="ph-bold ph-plus text-xl"></i>
          </button>
          <button
            @click="zoomOut"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Zoom Out"
          >
            <i class="ph-bold ph-minus text-xl"></i>
          </button>
        </div>
      </main>

      <RightMenu
        :building="displayedBuilding"
        :selected-room-id="selectedRoomId"
        @toggle-select="handleRoomToggle"
      />
    </div>
  </div>
</template>
