<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import AutoRotate from '@/components/AutoRotate.vue'
import LeftMenu from '@/components/menus/LeftMenu.vue'
import RightMenu from '@/components/menus/RightMenu.vue'
import ViewControls from '@/components/menus/ControlPanel.vue'
import { useBuildingModel } from '@/composables/useBuildingModel'
import { useSceneControls } from '@/composables/useSceneControls'

import { onMounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import type { Intersection } from 'three'
import { OrbitControls } from '@tresjs/cientos'

interface TresEvent extends Intersection {
  stopPropagation: () => void
}

const model = useBuildingModel()

const {
  cameraRef,
  controlsRef,
  isRotating,
  resetView,
  zoomIn,
  zoomOut,
  togglePanorama,
  triggerExplodeView,
} = useSceneControls()

const handleExplodeToggle = () => {
  const result = triggerExplodeView(
    model.selectedRoomId.value,
    model.building.value,
    model.isExploded.value,
  )
  model.isExploded.value = result.exploded
  model.explodedRoomId.value = result.roomId
}

const onRoomClick = (id: string, event: TresEvent) => {
  if (isRotating.value) return
  if (event && event.stopPropagation) event.stopPropagation()
  model.toggleRoom(id)
}

const isExplodedRoom = (roomId: string) => {
  return model.isExploded.value && model.explodedRoomId.value === roomId
}

onMounted(() => {
  model.fetchBuildings()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <LeftMenu
        :structure-ids="model.availableBuildingsNames.value"
        :selected-id="model.building.value?.id || null"
        :building="model.building.value"
        :active-floor="model.selectedFloor.value"
        @json-uploaded="model.fetchBuildings"
        @change-building="model.setBuildingByIndex"
        @change-floor="model.setFloor"
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

          <template v-if="model.building.value">
            <TresGroup
              v-for="room in model.visibleRooms.value"
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
                  :color="room.id === model.selectedRoomId.value ? '#10b981' : '#e2e8f0'"
                  :transparent="true"
                  :opacity="room.id === model.selectedRoomId.value ? 0.6 : 0.3"
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
          :selected-room-id="model.selectedRoomId.value"
          :is-exploded="model.isExploded.value"
          :disabled="isRotating"
          @reset-view="resetView"
          @toggle-explode="handleExplodeToggle"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
          @toggle-panorama="togglePanorama"
        />
      </main>

      <RightMenu
        :building="model.displayedBuilding.value"
        :selected-room-id="model.selectedRoomId.value"
        @toggle-select="model.toggleRoom"
      />
    </div>
  </div>
</template>
