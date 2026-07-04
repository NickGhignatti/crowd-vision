<script setup lang="ts">
import NavBar from '@/components/layouts/NavBar.vue'
import AutoRotate from '@/components/layouts/AutoRotate.vue'
import BuildingsSelector from '@/components/selectors/BuildingsSelector.vue'
import RoomsSelector from '@/components/selectors/RoomsSelector.vue'
import ViewControls from '@/components/panels/ControlPanel.vue'
import { useBuildingModel } from '@/composables/building/useBuildingModel.ts'
import { useSceneControls } from '@/composables/scene/useSceneControls.ts'
import {
  useBuildingAirQualitySensors,
  useBuildingTemperature,
} from '@/composables/building/useRoomsData.ts'
import { computed, onMounted, shallowRef, watch, watchEffect } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { Color, type Intersection, type InstancedMesh } from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { roomColorByTemperature, roomColorStandard, roomOpacity } from '@/helpers/colors.ts'
import { useModes } from '@/composables/scene/useModes.ts'
import { buildRoomMatrix, useInstancedRooms } from '@/composables/scene/useInstancedRooms.ts'

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
  const prev = roomColors.value
  const out: Record<string, string> = {}
  let changed = false
  for (const room of buildingModel.visibleRooms.value) {
    const c = modes.getColorByMode({
      temperature: roomTemperatures.value[room.id],
      indoorAqi: roomIndoorAqi.value[room.id],
    })
    out[room.id] = c
    if (prev[room.id] !== c) changed = true
  }
  // swap if any band changed or the room set changed size
  if (!changed && Object.keys(prev).length === Object.keys(out).length) return
  roomColors.value = out
})

// The selected room needs its own opacity and the exploded room needs its own
// render-order/edge outline, neither of which an InstancedMesh can express
// per-instance — so both are pulled out of the shared batch and rendered
// individually, same as before instancing existed.
const selectedRoomIdRef = computed(() => buildingModel.selectedRoomId.value)
const explodedRoomIdRef = computed(() => buildingModel.explodedRoomId.value)
const { instancedRooms, overlayRoom, roomIdByInstanceIndex } = useInstancedRooms(
  buildingModel.visibleRooms,
  selectedRoomIdRef,
  explodedRoomIdRef,
)
const explodedRoom = computed(() => {
  const id = buildingModel.explodedRoomId.value
  if (!id) return null
  return buildingModel.visibleRooms.value.find((room) => room.id === id) ?? null
})

const instancedMeshRef = shallowRef<InstancedMesh | null>(null)
const scratchColor = new Color()

// Imperative buffer writes, not reactive props: matches the "mutate existing
// objects, don't rebuild the scene" rule for the telemetry-driven color path.
watch(
  [instancedMeshRef, instancedRooms, roomColors],
  ([mesh, rooms]) => {
    if (!mesh) return
    rooms.forEach((room, index) => {
      mesh.setMatrixAt(index, buildRoomMatrix(room))
      scratchColor.set(roomColors.value[room.id] ?? roomColorStandard())
      mesh.setColorAt(index, scratchColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  },
  { immediate: true, flush: 'post' },
)

const handleExplodeToggle = () => {
  const result = triggerExplodeView(
    buildingModel.selectedRoomId.value,
    buildingModel.building.value,
    buildingModel.isExploded.value,
  )
  buildingModel.isExploded.value = result.exploded
  buildingModel.explodedRoomId.value = result.roomId
}

const onRoomClick = (event: TresEvent) => {
  if (isRotating.value) return
  event?.stopPropagation?.()
  const id =
    event.instanceId !== undefined
      ? roomIdByInstanceIndex.value[event.instanceId]
      : (event.object?.userData as { roomId?: string })?.roomId
  if (id) buildingModel.toggleRoom(id)
}

onMounted(() => {
  buildingModel.fetchBuildings()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <BuildingsSelector
        :buildingOptions="buildingModel.availableBuildingsNames.value"
        :selectedId="buildingModel.building.value?.id || null"
        :buildingModel="buildingModel.building.value"
        :activeFloor="buildingModel.selectedFloor.value"
        @json-uploaded="buildingModel.fetchBuildings"
        @change-building="buildingModel.setBuildingById"
        @change-floor="buildingModel.setFloor"
      />

      <main class="flex-1 relative bg-slate-50 z-0 min-w-0">
        <TresCanvas clear-color="#f8fafc" window-size>
          <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />

          <OrbitControls
            ref="controlsRef"
            make-default
            :damping-factor="0.05"
            :enabled="!isRotating"
          />

          <TresAmbientLight :intensity="0.6" />
          <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" />

          <AutoRotate :active="isRotating" :camera="cameraRef" />

          <template v-if="buildingModel.building.value">
            <TresInstancedMesh
              v-if="instancedRooms.length > 0"
              :key="`${currentBuildingId}:${buildingModel.selectedFloor.value}:${instancedRooms.length}`"
              ref="instancedMeshRef"
              :args="[undefined, undefined, instancedRooms.length]"
              @click="onRoomClick"
            >
              <TresBoxGeometry :args="[1, 1, 1]" />
              <TresMeshLambertMaterial
                :transparent="true"
                :opacity="roomOpacity(false)"
                :depth-write="false"
                :depth-test="true"
                :side="2"
              />
            </TresInstancedMesh>

            <TresGroup
              v-if="overlayRoom"
              :position="[overlayRoom.position.x, overlayRoom.position.y, overlayRoom.position.z]"
            >
              <TresMesh :user-data="{ roomId: overlayRoom.id }" @click="onRoomClick">
                <TresBoxGeometry
                  :args="[
                    overlayRoom.dimensions.width,
                    overlayRoom.dimensions.height,
                    overlayRoom.dimensions.depth,
                  ]"
                />
                <TresMeshLambertMaterial
                  :color="roomColors[overlayRoom.id]"
                  :transparent="true"
                  :opacity="roomOpacity(true)"
                  :depth-write="false"
                  :depth-test="true"
                  :side="2"
                />
              </TresMesh>
            </TresGroup>

            <TresGroup
              v-if="explodedRoom"
              :position="[explodedRoom.position.x, explodedRoom.position.y, explodedRoom.position.z]"
            >
              <TresLineSegments :render-order="10">
                <TresEdgesGeometry>
                  <TresBoxGeometry
                    :args="[
                      explodedRoom.dimensions.width,
                      explodedRoom.dimensions.height,
                      explodedRoom.dimensions.depth,
                    ]"
                  />
                </TresEdgesGeometry>
                <TresLineBasicMaterial color="#475569" :line-width="2" :depth-test="true" />
              </TresLineSegments>
            </TresGroup>
          </template>
        </TresCanvas>

        <ViewControls
          :selected-room-id="buildingModel.selectedRoomId.value"
          :is-exploded="buildingModel.isExploded.value"
          :disabled="isRotating"
          @reset-view="resetView"
          @toggle-explode="handleExplodeToggle"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
          @toggle-panorama="togglePanorama"
        />
      </main>

      <RoomsSelector
        :buildingModel="buildingModel.displayedBuilding.value"
        :selectedRoomId="buildingModel.selectedRoomId.value"
        @toggle-select="buildingModel.toggleRoom"
      />
    </div>
  </div>
</template>
