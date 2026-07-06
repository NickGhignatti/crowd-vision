<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue'
import type { Room } from '@/models/building.ts'
import {
  computeDrawnRoomSeed,
  computeHandleResize,
  screenToWorld,
  type HandleId,
  type HandleResizeResult,
  type PlanViewport,
} from '@/composables/scene/floorPlanGeometry.ts'

interface Props {
  rooms: Room[]
  floorY: number
  selectedId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [id: string | null]
  move: [id: string, position: { x: number; z: number }]
  resize: [id: string, result: HandleResizeResult]
  'add-room': [seed: { position: Room['position']; dimensions: Room['dimensions'] }]
}>()

// Fixed logical pixel size (not measured from the container): keeps the
// screen<->world math simple and, unlike a getScreenCTM-based approach,
// stays testable under jsdom, which doesn't implement SVG geometry APIs.
const viewport: PlanViewport = { width: 800, height: 600, scale: 20, centerX: 0, centerZ: 0 }

const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const svgRef = shallowRef<SVGSVGElement | null>(null)

type DragMode = 'move' | 'handle' | 'draw' | null
const dragMode = ref<DragMode>(null)
const dragRoomId = ref<string | null>(null)
const dragHandle = ref<HandleId | null>(null)
const drawStart = ref<{ x: number; z: number } | null>(null)
const drawCurrent = ref<{ x: number; z: number } | null>(null)

const pointerToWorld = (event: PointerEvent): { x: number; z: number } | null => {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return null
  return screenToWorld(viewport, event.clientX - rect.left, event.clientY - rect.top)
}

const endDrag = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  dragMode.value = null
  dragRoomId.value = null
  dragHandle.value = null
  drawStart.value = null
  drawCurrent.value = null
}

function onPointerMove(event: PointerEvent) {
  const world = pointerToWorld(event)
  if (!world) return

  if (dragMode.value === 'move' && dragRoomId.value) {
    emit('move', dragRoomId.value, world)
  } else if (dragMode.value === 'handle' && dragRoomId.value && dragHandle.value) {
    const room = props.rooms.find((r) => r.id === dragRoomId.value)
    if (room) emit('resize', dragRoomId.value, computeHandleResize(room, dragHandle.value, world))
  } else if (dragMode.value === 'draw') {
    drawCurrent.value = world
  }
}

function onPointerUp() {
  if (dragMode.value === 'draw' && drawStart.value && drawCurrent.value) {
    emit('add-room', computeDrawnRoomSeed(drawStart.value, drawCurrent.value, props.floorY))
  }
  endDrag()
}

const beginDrag = (mode: DragMode) => {
  dragMode.value = mode
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

// Guards against unmounting mid-drag (e.g. the toolbar's 3D/Plan toggle is
// clicked while a drag is in flight) leaking the window listeners forever.
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

const onRoomPointerDown = (room: Room, event: PointerEvent) => {
  event.stopPropagation()
  emit('select', room.id)
  dragRoomId.value = room.id
  beginDrag('move')
}

const onHandlePointerDown = (room: Room, handle: HandleId, event: PointerEvent) => {
  event.stopPropagation()
  dragRoomId.value = room.id
  dragHandle.value = handle
  beginDrag('handle')
}

const onBackgroundPointerDown = (event: PointerEvent) => {
  emit('select', null)
  const world = pointerToWorld(event)
  if (!world) return
  drawStart.value = world
  drawCurrent.value = world
  beginDrag('draw')
}

const roomRect = (room: Room) => {
  const topLeft = {
    x: viewport.width / 2 + (room.position.x - room.dimensions.width / 2 - viewport.centerX) * viewport.scale,
    y: viewport.height / 2 + (room.position.z - room.dimensions.depth / 2 - viewport.centerZ) * viewport.scale,
  }
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: room.dimensions.width * viewport.scale,
    height: room.dimensions.depth * viewport.scale,
  }
}

const handlePosition = (room: Room, handle: HandleId) => {
  const rect = roomRect(room)
  const xByLetter: Record<'w' | 'e' | 'mid', number> = {
    w: rect.x,
    e: rect.x + rect.width,
    mid: rect.x + rect.width / 2,
  }
  const yByLetter: Record<'n' | 's' | 'mid', number> = {
    n: rect.y,
    s: rect.y + rect.height,
    mid: rect.y + rect.height / 2,
  }
  const x = handle.includes('w') ? xByLetter.w : handle.includes('e') ? xByLetter.e : xByLetter.mid
  const y = handle.includes('n') ? yByLetter.n : handle.includes('s') ? yByLetter.s : yByLetter.mid
  return { x, y }
}

const drawRect = () => {
  if (!drawStart.value || !drawCurrent.value) return null
  const seed = computeDrawnRoomSeed(drawStart.value, drawCurrent.value, props.floorY)
  return roomRect({ ...seed, id: '', name: '', capacity: 0 } as Room)
}
</script>

<template>
  <svg
    ref="svgRef"
    data-testid="floor-plan"
    :width="viewport.width"
    :height="viewport.height"
    class="bg-slate-50"
    @pointerdown="onBackgroundPointerDown"
  >
    <defs>
      <pattern id="plan-grid" :width="viewport.scale" :height="viewport.scale" patternUnits="userSpaceOnUse">
        <path
          :d="`M ${viewport.scale} 0 L 0 0 0 ${viewport.scale}`"
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
      :width="viewport.width"
      :height="viewport.height"
      fill="url(#plan-grid)"
    />

    <g v-for="room in rooms" :key="room.id">
      <rect
        :data-testid="`plan-room-${room.id}`"
        v-bind="roomRect(room)"
        :fill="room.color ?? '#e2e8f0'"
        :stroke="room.id === selectedId ? '#059669' : '#94a3b8'"
        :stroke-width="room.id === selectedId ? 2 : 1"
        @pointerdown="onRoomPointerDown(room, $event)"
      />
      <text
        :x="roomRect(room).x + 4"
        :y="roomRect(room).y + 14"
        font-size="12"
        fill="#334155"
        class="pointer-events-none select-none"
      >
        {{ room.name }}
      </text>

      <rect
        v-for="handle in room.id === selectedId ? HANDLES : []"
        :key="handle"
        :data-testid="`plan-handle-${room.id}-${handle}`"
        :x="handlePosition(room, handle).x - 4"
        :y="handlePosition(room, handle).y - 4"
        width="8"
        height="8"
        fill="#059669"
        @pointerdown="onHandlePointerDown(room, handle, $event)"
      />
    </g>

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
