import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { Room } from '@/models/building.ts'
import {
  computeDrawnRoomSeed,
  computeHandleResize,
  screenToWorld,
  worldToScreen,
  type HandleId,
  type HandleResizeResult,
  type PlanViewport,
} from '@/composables/scene/floorPlanGeometry.ts'
import type { PlanTool } from '@/composables/scene/useModelEditor.ts'

const SCALE = 20
// Only used before the SVG has ever been measured (first synchronous render,
// or under jsdom where layout never actually happens).
const FALLBACK_SIZE = { width: 800, height: 600 }
// Wheel zoom multiplies the base 20px/world-unit scale by a clamped factor, so large
// buildings aren't stuck running off the edge of a fixed-scale view.
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
// exp(-deltaY * sensitivity) gives a smooth multiplicative step that scales naturally with
// both a mouse wheel's large per-notch delta (~100) and a trackpad's small continuous deltas.
const ZOOM_SENSITIVITY = 0.001
// World units a "draw" gesture must travel before it's treated as a
// deliberate new room rather than a stray click — see onPointerUp below.
const MIN_DRAG_DISTANCE_FOR_ROOM = 0.3

export interface PlanInteractionSource {
  rooms: () => Room[]
  floorY: () => number
  planTool: () => PlanTool
}

export interface PlanInteractionCallbacks {
  onSelect: (id: string | null) => void
  onMove: (id: string, position: { x: number; z: number }) => void
  onResize: (id: string, result: HandleResizeResult) => void
  onAddRoom: (seed: { position: Room['position']; dimensions: Room['dimensions'] }) => void
  onDragging: (value: boolean) => void
}

/** FloorPlanEditor.vue's non-presentational logic: viewport measurement, pointer/drag state
 * machine, and screen<->world projection — kept separate so the component stays template + thin wiring. */
export function usePlanInteraction(
  source: PlanInteractionSource,
  callbacks: PlanInteractionCallbacks,
) {
  const svgRef = shallowRef<SVGSVGElement | null>(null)

  // The SVG fills its container responsively — real pixel size depends on layout, not a fixed
  // constant; a hardcoded box would leave rooms un-draggable wherever a floating panel overlaps it.
  const svgSize = ref<{ width: number; height: number }>({ ...FALLBACK_SIZE })
  let resizeObserver: ResizeObserver | null = null

  const zoom = ref(1)
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
    zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor))
  }

  const measureSvgSize = () => {
    const rect = svgRef.value?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      svgSize.value = { width: rect.width, height: rect.height }
    }
  }

  onMounted(() => {
    measureSvgSize()
    resizeObserver = new ResizeObserver(measureSvgSize)
    if (svgRef.value) resizeObserver.observe(svgRef.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  })

  const getViewport = (): PlanViewport => ({
    width: svgSize.value.width,
    height: svgSize.value.height,
    scale: SCALE * zoom.value,
    centerX: 0,
    centerZ: 0,
  })

  type DragMode = 'move' | 'handle' | 'draw' | null
  const dragMode = ref<DragMode>(null)
  const dragRoomId = ref<string | null>(null)
  const dragHandle = ref<HandleId | null>(null)
  const drawStart = ref<{ x: number; z: number } | null>(null)
  const drawCurrent = ref<{ x: number; z: number } | null>(null)

  // Pointer math re-reads the live rect for the *offset* (rect.left/top can shift from scrolling
  // alone) but borrows svgSize for width/height/scale, so it never disagrees with what's rendered.
  const pointerToWorld = (event: PointerEvent): { x: number; z: number } | null => {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect) return null
    return screenToWorld(getViewport(), event.clientX - rect.left, event.clientY - rect.top)
  }

  const endDrag = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    dragMode.value = null
    dragRoomId.value = null
    dragHandle.value = null
    drawStart.value = null
    drawCurrent.value = null
    callbacks.onDragging(false)
  }

  function onPointerMove(event: PointerEvent) {
    const world = pointerToWorld(event)
    if (!world) return

    if (dragMode.value === 'move' && dragRoomId.value) {
      callbacks.onMove(dragRoomId.value, world)
    } else if (dragMode.value === 'handle' && dragRoomId.value && dragHandle.value) {
      const room = source.rooms().find((r) => r.id === dragRoomId.value)
      if (room) callbacks.onResize(dragRoomId.value, computeHandleResize(room, dragHandle.value, world))
    } else if (dragMode.value === 'draw') {
      drawCurrent.value = world
    }
  }

  function onPointerUp() {
    if (dragMode.value === 'draw' && drawStart.value && drawCurrent.value) {
      const distance = Math.hypot(
        drawCurrent.value.x - drawStart.value.x,
        drawCurrent.value.z - drawStart.value.z,
      )
      // A plain click must NOT create a room — the toolbar's "Add Room" button already covers
      // dropping a default-sized room; this gesture is specifically for sizing one as you place it.
      if (distance >= MIN_DRAG_DISTANCE_FOR_ROOM) {
        callbacks.onAddRoom(computeDrawnRoomSeed(drawStart.value, drawCurrent.value, source.floorY()))
      }
    }
    endDrag()
  }

  const beginDrag = (mode: DragMode) => {
    dragMode.value = mode
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    callbacks.onDragging(true)
  }

  const startDraw = (event: PointerEvent) => {
    const world = pointerToWorld(event)
    if (!world) return
    drawStart.value = world
    drawCurrent.value = world
    beginDrag('draw')
  }

  // In 'select' mode, grabbing a room moves it. In 'add' mode, the draw tool takes priority
  // over whatever's underneath the pointer, so clicking a room starts drawing instead of moving it.
  const onRoomPointerDown = (room: Room, event: PointerEvent) => {
    event.stopPropagation()
    if (source.planTool() === 'add') {
      startDraw(event)
      return
    }
    callbacks.onSelect(room.id)
    dragRoomId.value = room.id
    beginDrag('move')
  }

  const onHandlePointerDown = (room: Room, handle: HandleId, event: PointerEvent) => {
    event.stopPropagation()
    dragRoomId.value = room.id
    dragHandle.value = handle
    beginDrag('handle')
  }

  // In 'select' mode, empty space just deselects and never starts drawing a room. In 'add'
  // mode, empty space is exactly where you're meant to draw.
  const onBackgroundPointerDown = (event: PointerEvent) => {
    callbacks.onSelect(null)
    if (source.planTool() === 'add') {
      startDraw(event)
    }
  }

  const roomRect = (room: Room) => {
    const viewport = getViewport()
    const topLeft = worldToScreen(
      viewport,
      room.position.x - room.dimensions.width / 2,
      room.position.z - room.dimensions.depth / 2,
    )
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
    const seed = computeDrawnRoomSeed(drawStart.value, drawCurrent.value, source.floorY())
    return roomRect({ ...seed, id: '', name: '', capacity: 0 } as Room)
  }

  return {
    svgRef,
    zoom,
    getViewport,
    roomRect,
    handlePosition,
    drawRect,
    onRoomPointerDown,
    onHandlePointerDown,
    onBackgroundPointerDown,
    onWheel,
  }
}
