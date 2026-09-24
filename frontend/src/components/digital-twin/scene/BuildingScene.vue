<script setup lang="ts">
import { computed, ref, shallowRef, toRef, watchEffect } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { NoToneMapping } from 'three'
import type { Building, Room } from '@/types/digital-twin/building.ts'
import { Mode, useModes } from '@/composables/digital-twin/useModes.ts'
import { useSceneControls } from '@/composables/digital-twin/useSceneControls.ts'
import { useInstancedRooms } from '@/composables/digital-twin/useInstancedRooms.ts'
import { createWebGPURenderer } from '@/composables/digital-twin/useWebGPURenderer.ts'
import { roomColorStandard } from '@/utils/digital-twin/colors.ts'
import { renderStyleConfig } from '@/utils/digital-twin/renderStyleConfig.ts'
import { thermalGlows } from '@/utils/digital-twin/thermalGlow.ts'
import { airHazes } from '@/utils/digital-twin/airHaze.ts'
import { hiddenEdges, snapRooms } from '@/utils/digital-twin/snapRooms.ts'
import { groundExtent, sensorBadges } from '@/utils/digital-twin/sensors.ts'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import {
  useBuildingAirQualitySensors,
  useBuildingTemperature,
} from '@/composables/digital-twin/useRoomsData.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'
import RenderInvalidator from '@/components/digital-twin/scene/RenderInvalidator.vue'
import AutoRotate from '@/components/digital-twin/scene/AutoRotate.vue'
import ThermalGlow from '@/components/digital-twin/scene/ThermalGlow.vue'
import AirHaze from '@/components/digital-twin/scene/AirHaze.vue'
import RoomInstances from '@/components/digital-twin/scene/RoomInstances.vue'
import SelectedRoom from '@/components/digital-twin/scene/SelectedRoom.vue'
import RoomOutline from '@/components/digital-twin/scene/RoomOutline.vue'
import SensorBadges from '@/components/digital-twin/scene/SensorBadges.vue'
import GroundPlane from '@/components/digital-twin/scene/GroundPlane.vue'
import PlacementCursor from '@/components/digital-twin/scene/PlacementCursor.vue'
import SensorSprites from '@/components/digital-twin/scene/SensorSprites.vue'
import { sensorSprites } from '@/utils/digital-twin/sensorDraft.ts'
import SceneToolbar from '@/components/digital-twin/controls/SceneToolbar.vue'
import SceneLegend from '@/components/digital-twin/controls/SceneLegend.vue'

export interface ExplodeState {
  exploded: boolean
  roomId: string | null
}

const props = defineProps<{
  building: Building | null
  rooms: Room[]
  floor: number | null
  selectedRoomId: string | null
  explodedRoomId: string | null
  isExploded: boolean
}>()

const emit = defineEmits<{ 'toggle-room': [roomId: string]; explode: [state: ExplodeState] }>()

const CLEAR_COLOR = { light: '#f2f3ff', dark: '#0f1729' }
const OUTLINE_COLOR = { light: '#475569', dark: '#bccac0' }

const { theme } = useTheme()
const renderStyle = useRenderStyle()
const modes = useModes()
const controls = useSceneControls()
const { cameraRef, controlsRef, isRotating } = controls

// Always WebGPURenderer: it falls back to WebGL2 itself, and the shell shader only runs there.
const rendererFactory = createWebGPURenderer

// On-demand only: TresJS 'always' mode deadlocks when switched to with no frame in flight.
const frameTick = ref(0)
const requestFrame = () => frameTick.value++
const repaintTrigger = computed(() => `${frameTick.value}:${theme.value}:${!!ground.value}`)

const buildingId = computed(() => props.building?.id)
const { temperatures } = useBuildingTemperature(buildingId)
const { indoorAqi } = useBuildingAirQualitySensors(buildingId)

// Swapped only when a band changes, so a tick that moves no room's colour costs no repaint.
const colors = shallowRef<Record<string, string>>({})
watchEffect(() => {
  const next: Record<string, string> = {}
  for (const room of props.rooms) {
    const color = modes.getColorByMode({
      temperature: temperatures.value[room.id],
      maxTemperature: room.maxTemperature,
      indoorAqi: indoorAqi.value[room.id],
    })
    // Rooms with no data take the theme's shell tint; data colours keep their meaning.
    next[room.id] =
      color === roomColorStandard()
        ? renderStyleConfig(renderStyle.current.value).idleColor[theme.value]
        : color
  }
  const previous = colors.value
  const changed =
    Object.keys(previous).length !== Object.keys(next).length ||
    Object.entries(next).some(([id, color]) => previous[id] !== color)
  if (changed) colors.value = next
})

// Drawn geometry only: rooms a wall's thickness apart are shown touching.
const drawnRooms = computed(() => snapRooms(props.rooms))
const sharedEdges = computed(() => hiddenEdges(drawnRooms.value))
const sensorEditor = useSensorEditor()
// Pins would clutter every other view, so they show in sensors mode or while editing. The groups
// are mounted only then: an Html overlay costs a projection and a DOM write every frame, which at
// ~120 of them is 40 ms a frame, whether or not anything is visible.
const showMarkers = computed(
  () => modes.currentMode.value === Mode.Sensors || sensorEditor.isEditing.value,
)
// A kind switched off in the legend hides with `v-show`: unmounting one overlay of a mounted group
// can leave its element on screen, which looked like a filter that did nothing.
const hidden = computed(() => sensorEditor.hiddenTypes.value)
const badges = computed(() =>
  showMarkers.value ? sensorBadges(drawnRooms.value, sensorEditor.rows.value, hidden.value) : [],
)
const movingKey = computed(() => sensorEditor.pendingPlacement.value?.moving?.key ?? null)
const sprites = computed(() =>
  showMarkers.value ? sensorSprites(sensorEditor.rows.value, hidden.value, movingKey.value) : [],
)
/** Clicking a pin moves it: the sprite carries only its key, so the row is looked up here. */
const startMovingByKey = (key: string) => {
  const row = sensorEditor.rows.value.find((candidate) => candidate.key === key)
  if (row) sensorEditor.startMoving(row)
}
const markersInteractive = computed(
  () => sensorEditor.isEditing.value && !sensorEditor.pendingPlacement.value,
)
// The floor on screen, not the whole building: placing happens on what you can see and click.
const ground = computed(() =>
  sensorEditor.pendingPlacement.value ? groundExtent(drawnRooms.value) : null,
)

const isThermal = computed(() => modes.currentMode.value === Mode.TemperatureSensor)
const isAir = computed(() => modes.currentMode.value === Mode.AirQualitySensor)
// In a data mode the glow or haze carries the colour, so shells fall back to the neutral tint.
const shellColors = computed(() => (isThermal.value || isAir.value ? {} : colors.value))
const hazes = computed(() => (isAir.value ? airHazes(drawnRooms.value, indoorAqi.value) : []))
const glows = computed(() =>
  isThermal.value ? thermalGlows(drawnRooms.value, temperatures.value) : [],
)

const { instancedRooms, hiddenRooms, overlayRoom } = useInstancedRooms(
  drawnRooms,
  toRef(props, 'selectedRoomId'),
  toRef(props, 'explodedRoomId'),
)

const explodedRoom = computed(
  () => drawnRooms.value.find((room) => room.id === props.explodedRoomId) ?? null,
)

// A new count needs a new InstancedMesh, so the batch remounts per building, floor and size.
// Built from the rooms on screen, never from the batch: anything that varies with selection here
// would remount the room mesh, glow and haze on every click and recompile their shaders.
const batchKey = computed(() => `${buildingId.value}:${props.floor}:${drawnRooms.value.length}`)

// The preview marker's colour: distinct from rooms, readable on both themes.
const PREVIEW_COLOR = '#f59e0b'

const select = (roomId: string) => {
  // While placing a sensor, a click drops it; it must not also select the room under it.
  if (isRotating.value || sensorEditor.pendingPlacement.value) return
  emit('toggle-room', roomId)
}

// Moving the camera directly emits no OrbitControls change, so each move asks for a frame.
const withFrame = (action: () => void) => () => {
  action()
  requestFrame()
}

const reset = withFrame(controls.resetView)
const zoomIn = withFrame(controls.zoomIn)
const zoomOut = withFrame(controls.zoomOut)
const topDown = withFrame(() => controls.topDown(props.building?.rooms ?? []))
const focus = withFrame(() =>
  emit(
    'explode',
    controls.triggerExplodeView(props.selectedRoomId, props.building, props.isExploded),
  ),
)
</script>

<template>
  <div class="relative h-full w-full">
    <TresCanvas
      :clear-color="CLEAR_COLOR[theme]"
      :tone-mapping="NoToneMapping"
      :dpr="[1, 2]"
      render-mode="on-demand"
      :renderer="rendererFactory"
    >
      <RenderInvalidator :trigger="repaintTrigger" />
      <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
      <OrbitControls ref="controlsRef" make-default :damping-factor="0.05" :enabled="!isRotating" />
      <TresAmbientLight :intensity="0.6" />
      <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" />
      <AutoRotate :active="isRotating" :camera="cameraRef" />

      <template v-if="building">
        <ThermalGlow :key="`glow:${batchKey}:${glows.length}`" :glows="glows" :colors="colors" />
        <AirHaze :key="`haze:${batchKey}:${hazes.length}`" :hazes="hazes" :colors="colors" />
        <RoomInstances
          :key="batchKey"
          :rooms="instancedRooms"
          :colors="shellColors"
          :hidden-edges="sharedEdges"
          :hidden="hiddenRooms"
          @select="select"
        />
        <SelectedRoom
          v-if="overlayRoom"
          :room="overlayRoom"
          :color="shellColors[overlayRoom.id]"
          @select="select"
        />
        <SensorBadges v-if="showMarkers" :badges="badges" :theme="theme" />
        <SensorSprites
          v-if="showMarkers"
          :sprites="sprites"
          :theme="theme"
          :interactive="markersInteractive"
          @move="startMovingByKey"
        />
        <GroundPlane v-if="ground" :extent="ground" :color="OUTLINE_COLOR[theme]" />
        <PlacementCursor
          v-if="ground"
          :rooms="drawnRooms"
          :building-rooms="building.rooms"
          :color="PREVIEW_COLOR"
          :picked="sensorEditor.candidate.value?.position ?? null"
          @pick="sensorEditor.pick"
        />
        <RoomOutline v-if="explodedRoom" :room="explodedRoom" :color="OUTLINE_COLOR[theme]" />
      </template>
    </TresCanvas>

    <div
      class="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-3 px-4"
    >
      <SceneLegend class="pointer-events-auto" />
      <SceneToolbar
        class="pointer-events-auto"
        :can-focus="!!selectedRoomId"
        :is-focused="isExploded"
        :is-rotating="isRotating"
        @reset="reset"
        @focus="focus"
        @zoom-in="zoomIn"
        @top-view="topDown"
        @zoom-out="zoomOut"
        @rotate="controls.togglePanorama"
      />
    </div>
  </div>
</template>
