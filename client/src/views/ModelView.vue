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
import { computed, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { Color, Matrix4, NoToneMapping, type Intersection, type InstancedMesh } from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { roomColorByTemperature, roomColorStandard, roomOpacity } from '@/helpers/colors.ts'
import { useModes } from '@/composables/scene/useModes.ts'
import {
  applyRoomColors,
  applyRoomMatrices,
  useInstancedRooms,
} from '@/composables/scene/useInstancedRooms.ts'
import {
  createWebGPURenderer,
  isWebGPUSupported,
  SCENE_CLEAR_COLOR,
} from '@/composables/scene/useWebGPURenderer.ts'
import { selectRenderMode } from '@/composables/scene/useRenderMode.ts'
import RenderInvalidator from '@/components/scene/RenderInvalidator.vue'

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

// No automatic WebGL fallback from TresJS if the custom renderer factory is
// wired in on an unsupported browser, so only pass it when the API exists.
const rendererFactory = isWebGPUSupported() ? createWebGPURenderer : undefined

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
const scratchMatrix = new Matrix4()

// Bumped whenever a repaint is needed (on-demand render mode won't draw otherwise);
// read by RenderInvalidator, which is the only place `invalidate()` is legal to call.
const frameRequestTick = ref(0)
const requestFrame = () => {
  frameRequestTick.value++
}

const renderMode = computed(() => selectRenderMode(isRotating.value))

// Room positions/sizes are static per building+floor, so the matrix rebuild (and the
// bounding-sphere recompute it needs) only has to run when the instanced room set
// changes — not on every telemetry tick, which is what the color-only watch below is for.
watch(
  [instancedMeshRef, instancedRooms],
  ([mesh, rooms]) => {
    if (!mesh) return
    applyRoomMatrices(mesh, rooms, scratchMatrix)
    applyRoomColors(mesh, rooms, roomColors.value, scratchColor, roomColorStandard())
    requestFrame()
  },
  { immediate: true, flush: 'post' },
)

// Imperative buffer writes, not reactive props: matches the "mutate existing
// objects, don't rebuild the scene" rule for the telemetry-driven color path.
watch(
  [instancedMeshRef, roomColors],
  ([mesh]) => {
    if (!mesh) return
    applyRoomColors(mesh, instancedRooms.value, roomColors.value, scratchColor, roomColorStandard())
    requestFrame()
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
  requestFrame()
}

const onRoomClick = (event: TresEvent) => {
  if (isRotating.value) return
  event?.stopPropagation?.()
  const id =
    event.instanceId !== undefined
      ? roomIdByInstanceIndex.value[event.instanceId]
      : (event.object?.userData as { roomId?: string })?.roomId
  if (id) buildingModel.toggleRoom(id)
  requestFrame()
}

// Direct camera.position mutations (unlike OrbitControls drag) don't necessarily emit
// an OrbitControls `change` event, so on-demand mode needs an explicit frame request.
const handleResetView = () => {
  resetView()
  requestFrame()
}

const handleZoomIn = () => {
  zoomIn()
  requestFrame()
}

const handleZoomOut = () => {
  zoomOut()
  requestFrame()
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
        <TresCanvas
          :clear-color="SCENE_CLEAR_COLOR"
          :tone-mapping="NoToneMapping"
          :dpr="[1, 2]"
          :render-mode="renderMode"
          window-size
          :renderer="rendererFactory"
        >
          <RenderInvalidator :trigger="frameRequestTick" />

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
          @reset-view="handleResetView"
          @toggle-explode="handleExplodeToggle"
          @zoom-in="handleZoomIn"
          @zoom-out="handleZoomOut"
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
