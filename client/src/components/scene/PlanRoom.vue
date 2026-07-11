<script setup lang="ts">
import type { Room } from '@/models/building.ts'
import type { HandleId } from '@/composables/scene/floorPlanGeometry.ts'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface HandleMarker {
  id: HandleId
  x: number
  y: number
}

interface Props {
  room: Room
  rect: Rect
  isSelected: boolean
  handles: HandleMarker[]
}

defineProps<Props>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  'handle-pointerdown': [handle: HandleId, event: PointerEvent]
}>()
</script>

<template>
  <g>
    <rect
      :data-testid="`plan-room-${room.id}`"
      v-bind="rect"
      fill="#ffffff"
      :stroke="isSelected ? '#059669' : '#1e293b'"
      :stroke-width="isSelected ? 3 : 2"
      @pointerdown="emit('pointerdown', $event)"
    />
    <text
      :x="rect.x + 4"
      :y="rect.y + 14"
      font-size="12"
      fill="#334155"
      class="pointer-events-none select-none"
    >
      {{ room.name }}
    </text>

    <rect
      v-for="handle in handles"
      :key="handle.id"
      :data-testid="`plan-handle-${room.id}-${handle.id}`"
      :x="handle.x - 4"
      :y="handle.y - 4"
      width="8"
      height="8"
      fill="#059669"
      @pointerdown="emit('handle-pointerdown', handle.id, $event)"
    />
  </g>
</template>
