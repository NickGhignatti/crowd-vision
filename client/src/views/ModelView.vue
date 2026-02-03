<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { Vector3 } from 'three'
import NavBar from '@/components/NavBar.vue'
import LeftMenu from '@/components/menus/LeftMenu.vue'
import RightMenu from '@/components/menus/RightMenu.vue'
import ViewControls from '@/components/menus/ControlPanel.vue'
import type { BuildingPayload } from '@/scripts/schema.ts'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js'
import { OrbitControls } from '@tresjs/cientos'
import AutoRotate from '@/components/AutoRotate.vue'

const serverUrl = import.meta.env.VITE_SERVER_URL

interface TresEvent {
  stopPropagation: () => void
}

const buildingRef = ref<BuildingPayload | null>(null)
const selectedRoomId = ref<string | null>(null)
const explodedRoomId = ref<string | null>(null)
const selectedFloor = ref<number | null>(null)
const isExploded = ref(false)

let allAvailableBuildings: BuildingPayload[] = []
const availableBuildingsNames = ref<string[]>([])

const cameraRef = ref<PerspectiveCamera | null>(null)
const controlsRef = ref<{ value: OrbitControlsType } | null>(null)

watch(
  () => buildingRef.value,
  (newValue) => {
    if (newValue) {
      selectedRoomId.value = null
      selectedFloor.value = null
    }
  },
)

const visibleRooms = computed(() => {
  if (!buildingRef.value) return []

  let rooms = buildingRef.value.rooms

  if (selectedFloor.value !== null) {
    rooms = rooms.filter((r) => r.position.y === selectedFloor.value)
  }

  if (isExploded.value && explodedRoomId.value) {
    const targetRoom = buildingRef.value.rooms.find((r) => r.id === explodedRoomId.value)

    if (targetRoom) {
      rooms = rooms.filter(
        (r) =>
          r.position.y >= targetRoom.position.y &&
          r.position.x >= targetRoom.position.x &&
          r.position.z >= targetRoom.position.z &&
          r.position.y + r.dimensions.height <=
            targetRoom.position.y + targetRoom.dimensions.height &&
          r.position.x + r.dimensions.width <=
            targetRoom.position.x + targetRoom.dimensions.width &&
          r.position.z + r.dimensions.depth <= targetRoom.position.z + targetRoom.dimensions.depth,
      )
    }
  }

  return rooms
})

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

const handleFloorChange = (floorY: number | null) => {
  selectedFloor.value = floorY
  selectedRoomId.value = null
}

const onRoomClick = (id: string, event: TresEvent) => {
  if (isRotating.value) return
  if (event && event.stopPropagation) event.stopPropagation()
  handleRoomToggle(id)
}

onMounted(() => {
  requestBuildingSchema()
})

const resetView = () => {
  if (cameraRef.value && controlsRef.value) {
    cameraRef.value.position.set(10, 10, 10)
    // controlsRef.value.value.target.set(0, 0, 0)
    // controlsRef.value.value.update()
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

const toggleExplode = () => {
  if (!selectedRoomId.value || !buildingRef.value) return

  if (isExploded.value) {
    resetView()
    isExploded.value = false
    explodedRoomId.value = null
    return
  }

  const room = buildingRef.value.rooms.find((r) => r.id === selectedRoomId.value)
  if (!room || !cameraRef.value || !controlsRef.value) return

  const roomCenter = new Vector3(
    room.position.x,
    room.position.y + room.dimensions.height / 2,
    room.position.z,
  )

  const offset = new Vector3(10, 10, 15)
  const newPosition = roomCenter.clone().add(offset)

  cameraRef.value.position.copy(newPosition)
  isExploded.value = true
  explodedRoomId.value = selectedRoomId.value
}

const isExplodedRoom = (roomId: string) => {
  return isExploded.value && explodedRoomId.value === roomId
}

const isRotating = ref(false)

const togglePanorama = () => {
  isRotating.value = !isRotating.value
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
          <OrbitControls
            ref="controlsRef"
            make-default
            :damping-factor="0.05"
            :enabled="!isRotating"
          />

          <TresAmbientLight :intensity="0.6" />
          <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" cast-shadow />

          <AutoRotate :active="isRotating" :camera="cameraRef" />

          <template v-if="buildingRef">
            <TresGroup
              v-for="room in visibleRooms"
              :key="room.id"
              :position="[room.position.x, room.position.y, room.position.z]"
            >
              <TresMesh
                @click="(ev) => onRoomClick(room.id, ev)"
                :render-order="isExplodedRoom(room.id) ? -1 : 0"
                :visible="!isExplodedRoom(room.id)"
              >
                <TresBoxGeometry
                  :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
                />
                <TresMeshStandardMaterial
                  :color="room.id === selectedRoomId ? '#10b981' : '#e2e8f0'"
                  :transparent="true"
                  :opacity="room.id === selectedRoomId ? 0.6 : 0.3"
                  :depth-write="false"
                  :depth-test="true"
                  :side="2"
                />
              </TresMesh>

              <TresLineSegments v-if="isExplodedRoom(room.id)" :render-order="10">
                <TresEdgesGeometry>
                  <TresBoxGeometry
                    :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
                  />
                </TresEdgesGeometry>
                <TresLineBasicMaterial color="#475569" :line-width="2" :depth-test="true" />
              </TresLineSegments>
            </TresGroup>
          </template>
        </TresCanvas>

        <ViewControls
          :selected-room-id="selectedRoomId"
          :is-exploded="isExploded"
          :disabled="isRotating"
          @reset-view="resetView"
          @toggle-explode="toggleExplode"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
          @toggle-panorama="togglePanorama"
        />
      </main>

      <RightMenu
        :building="displayedBuilding"
        :selected-room-id="selectedRoomId"
        @toggle-select="handleRoomToggle"
      />
    </div>
  </div>
</template>
