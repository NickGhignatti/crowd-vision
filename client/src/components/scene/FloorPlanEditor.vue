<script setup lang="ts">
import type { Room } from '@/models/building.ts'
import type { HandleId, HandleResizeResult } from '@/composables/scene/floorPlanGeometry.ts'
import type { PlanTool } from '@/composables/scene/useModelEditor.ts'
import { usePlanInteraction } from '@/composables/scene/usePlanInteraction.ts'
import PlanRoom from '@/components/scene/PlanRoom.vue'

interface Props {
  rooms: Room[]
  floorY: number
  selectedId: string | null
  planTool: PlanTool
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [id: string | null]
  move: [id: string, position: { x: number; z: number }]
  resize: [id: string, result: HandleResizeResult]
  'add-room': [seed: { position: Room['position']; dimensions: Room['dimensions'] }]
  dragging: [value: boolean]
}>()

const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const {
  svgRef,
  getViewport,
  roomRect,
  handlePosition,
  drawRect,
  onRoomPointerDown,
  onHandlePointerDown,
  onBackgroundPointerDown,
  onWheel,
} = usePlanInteraction(
  {
    rooms: () => props.rooms,
    floorY: () => props.floorY,
    planTool: () => props.planTool,
  },
  {
    onSelect: (id) => emit('select', id),
    onMove: (id, position) => emit('move', id, position),
    onResize: (id, result) => emit('resize', id, result),
    onAddRoom: (seed) => emit('add-room', seed),
    onDragging: (value) => emit('dragging', value),
  },
)

const roomHandles = (room: Room) => {
  if (room.id !== props.selectedId) return []
  return HANDLES.map((id) => ({ id, ...handlePosition(room, id) }))
}
</script>

<template>
  <svg
    ref="svgRef"
    data-testid="floor-plan"
    width="100%"
    height="100%"
    :class="['absolute inset-0 bg-slate-50', planTool === 'add' ? 'cursor-crosshair' : 'cursor-default']"
    @pointerdown="onBackgroundPointerDown"
    @wheel="onWheel"
  >
    <defs>
      <pattern
        id="plan-grid"
        :width="getViewport().scale"
        :height="getViewport().scale"
        patternUnits="userSpaceOnUse"
      >
        <path
          :d="`M ${getViewport().scale} 0 L 0 0 0 ${getViewport().scale}`"
          fill="none"
          stroke="#e2e8f0"
          stroke-width="1"
        />
      </pattern>
    </defs>

    <rect
      data-testid="plan-background"
      x="0"
      y="0"
      :width="getViewport().width"
      :height="getViewport().height"
      fill="url(#plan-grid)"
    />

    <PlanRoom
      v-for="room in rooms"
      :key="room.id"
      :room="room"
      :rect="roomRect(room)"
      :is-selected="room.id === selectedId"
      :handles="roomHandles(room)"
      @pointerdown="onRoomPointerDown(room, $event)"
      @handle-pointerdown="(handle, event) => onHandlePointerDown(room, handle, event)"
    />

    <rect
      v-if="drawRect()"
      data-testid="plan-draw-preview"
      v-bind="drawRect()!"
      fill="none"
      stroke="#059669"
      stroke-width="2"
      stroke-dasharray="4"
      class="pointer-events-none"
    />
  </svg>
</template>
