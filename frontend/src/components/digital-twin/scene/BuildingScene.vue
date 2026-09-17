<script setup lang="ts">
import { computed, ref, shallowRef, toRef, watchEffect } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { NoToneMapping } from 'three'
import type { Building, Room } from '@/types/digital-twin/building.ts'
import { useModes } from '@/composables/digital-twin/useModes.ts'
import { useSceneControls } from '@/composables/digital-twin/useSceneControls.ts'
import { useInstancedRooms } from '@/composables/digital-twin/useInstancedRooms.ts'
import { createWebGPURenderer } from '@/composables/digital-twin/useWebGPURenderer.ts'
import { roomColorStandard } from '@/utils/digital-twin/colors.ts'
import { renderStyleConfig } from '@/utils/digital-twin/renderStyleConfig.ts'
import {
  useBuildingAirQualitySensors,
  useBuildingTemperature,
} from '@/composables/digital-twin/useRoomsData.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'
import RenderInvalidator from '@/components/digital-twin/scene/RenderInvalidator.vue'
import AutoRotate from '@/components/digital-twin/scene/AutoRotate.vue'
import RoomInstances from '@/components/digital-twin/scene/RoomInstances.vue'
import SelectedRoom from '@/components/digital-twin/scene/SelectedRoom.vue'
import RoomOutline from '@/components/digital-twin/scene/RoomOutline.vue'
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
const repaintTrigger = computed(() => `${frameTick.value}:${theme.value}`)

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

const { instancedRooms, overlayRoom } = useInstancedRooms(
  toRef(props, 'rooms'),
  toRef(props, 'selectedRoomId'),
  toRef(props, 'explodedRoomId'),
)

const explodedRoom = computed(
  () => props.rooms.find((room) => room.id === props.explodedRoomId) ?? null,
)

// A new count needs a new InstancedMesh, so the batch remounts per building, floor and size.
const batchKey = computed(() => `${buildingId.value}:${props.floor}:${instancedRooms.value.length}`)

const select = (roomId: string) => {
  if (isRotating.value) return
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
      window-size
      :renderer="rendererFactory"
    >
      <RenderInvalidator :trigger="repaintTrigger" />
      <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
      <OrbitControls ref="controlsRef" make-default :damping-factor="0.05" :enabled="!isRotating" />
      <TresAmbientLight :intensity="0.6" />
      <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" />
      <AutoRotate :active="isRotating" :camera="cameraRef" />

      <template v-if="building">
        <RoomInstances :key="batchKey" :rooms="instancedRooms" :colors="colors" @select="select" />
        <SelectedRoom
          v-if="overlayRoom"
          :room="overlayRoom"
          :color="colors[overlayRoom.id]"
          @select="select"
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
        @zoom-out="zoomOut"
        @rotate="controls.togglePanorama"
      />
    </div>
  </div>
</template>
