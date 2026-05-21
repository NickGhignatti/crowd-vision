<script setup lang="ts">
import NavBar from '@/components/layouts/NavBar.vue'
import AutoRotate from '@/components/layouts/AutoRotate.vue'
import BuildingsSelector from '@/components/selectors/BuildingsSelector.vue'
import RoomsSelector from '@/components/selectors/RoomsSelector.vue'
import ViewControls from '@/components/panels/ControlPanel.vue'
import { useBuildingModel } from '@/composables/building/useBuildingModel.ts'
import { useSceneControls } from '@/composables/scene/useSceneControls.ts'
import { useBuildingAirQualitySensors, useBuildingTemperature } from '@/composables/building/useRoomsData.ts'
import { computed, onMounted, shallowRef, watchEffect } from 'vue'
import { TresCanvas } from '@tresjs/core'
import type { Intersection } from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { roomColorByTemperature, roomOpacity } from '@/helpers/colors.ts'
import { useModes } from '@/composables/scene/useModes.ts'

interface TresEvent extends Intersection {
  stopPropagation: () => void
}

const buildingModel = useBuildingModel()

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

const modes = useModes()

const currentBuildingId = computed(() => buildingModel.building.value?.id)
const { temperatures: roomTemperatures } = useBuildingTemperature(currentBuildingId)
const { indoorAqi: roomIndoorAqi } = useBuildingAirQualitySensors(currentBuildingId)

const roomColors = shallowRef<Record<string, string>>({})
watchEffect(() => {
  const out: Record<string, string> = {}
  for (const room of buildingModel.visibleRooms.value) {
    out[room.id] = modes.getColorByMode({
      temperature: roomTemperatures.value[room.id],
      indoorAqi: roomIndoorAqi.value[room.id],
    })
  }
  roomColors.value = out
})

const handleExplodeToggle = () => {
  const result = triggerExplodeView(
    buildingModel.selectedRoomId.value,
    buildingModel.building.value,
    buildingModel.isExploded.value,
  )
  buildingModel.isExploded.value = result.exploded
  buildingModel.explodedRoomId.value = result.roomId
}

const onRoomClick = (id: string, event: TresEvent) => {
  if (isRotating.value) return
  if (event && event.stopPropagation) event.stopPropagation()
  buildingModel.toggleRoom(id)
}

const isExplodedRoom = (roomId: string) => {
  return buildingModel.isExploded.value && buildingModel.explodedRoomId.value === roomId
}

onMounted(() => {
  buildingModel.fetchBuildings()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <BuildingsSelector :buildingOptions="buildingModel.availableBuildingsNames.value"
        :selectedId="buildingModel.building.value?.id || null" :buildingModel="buildingModel.building.value"
        :activeFloor="buildingModel.selectedFloor.value" @json-uploaded="buildingModel.fetchBuildings"
        @change-building="buildingModel.setBuildingByIndex" @change-floor="buildingModel.setFloor" />

      <main class="flex-1 relative bg-slate-50 z-0 min-w-0">
        <TresCanvas clear-color="#f8fafc" window-size shadows>
          <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />

          <OrbitControls ref="controlsRef" make-default :damping-factor="0.05" :enabled="!isRotating" />

          <TresAmbientLight :intensity="0.6" />
          <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" cast-shadow />

          <AutoRotate :active="isRotating" :camera="cameraRef" />

          <template v-if="buildingModel.building.value">
            <TresGroup v-for="room in buildingModel.visibleRooms.value" :key="room.id"
              :position="[room.position.x, room.position.y, room.position.z]">
              <TresMesh @click="(ev) => onRoomClick(room.id, ev)" :render-order="isExplodedRoom(room.id) ? -1 : 0"
                :visible="!isExplodedRoom(room.id)">
                <TresBoxGeometry :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]" />
                <TresMeshStandardMaterial :color="roomColors[room.id]" :transparent="true"
                  :opacity="roomOpacity(room.id === buildingModel.selectedRoomId.value)" :depth-write="false"
                  :depth-test="true" :side="2" />
              </TresMesh>

              <TresLineSegments v-if="isExplodedRoom(room.id)" :render-order="10">
                <TresEdgesGeometry>
                  <TresBoxGeometry :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]" />
                </TresEdgesGeometry>
                <TresLineBasicMaterial color="#475569" :line-width="2" :depth-test="true" />
              </TresLineSegments>
            </TresGroup>
          </template>
        </TresCanvas>

        <ViewControls :selected-room-id="buildingModel.selectedRoomId.value"
          :is-exploded="buildingModel.isExploded.value" :disabled="isRotating" @reset-view="resetView"
          @toggle-explode="handleExplodeToggle" @zoom-in="zoomIn" @zoom-out="zoomOut"
          @toggle-panorama="togglePanorama" />
      </main>

      <RoomsSelector :buildingModel="buildingModel.displayedBuilding.value"
        :selectedRoomId="buildingModel.selectedRoomId.value" @toggle-select="buildingModel.toggleRoom" />
    </div>
  </div>
</template>
