import type { Room } from '@/models/building.ts'
import type { ResizeAnchor } from '@/composables/scene/useModelEditor.ts'

const MIN_ROOM_DIMENSION = 0.5
const DEFAULT_ROOM_HEIGHT = 3

/** The 2D plan's camera: a world→pixel mapping, top-down (X→screen X, Z→screen Y). */
export interface PlanViewport {
  width: number
  height: number
  scale: number
  centerX: number
  centerZ: number
}

export function worldToScreen(
  viewport: PlanViewport,
  worldX: number,
  worldZ: number,
): { x: number; y: number } {
  return {
    x: viewport.width / 2 + (worldX - viewport.centerX) * viewport.scale,
    y: viewport.height / 2 + (worldZ - viewport.centerZ) * viewport.scale,
  }
}

export function screenToWorld(
  viewport: PlanViewport,
  screenX: number,
  screenY: number,
): { x: number; z: number } {
  return {
    x: viewport.centerX + (screenX - viewport.width / 2) / viewport.scale,
    z: viewport.centerZ + (screenY - viewport.height / 2) / viewport.scale,
  }
}

// Compass-style handle ids: n/s = min/max Z (top/bottom of the plan), e/w =
// max/min X (right/left); corners combine one of each.
export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface HandleResizeResult {
  width?: number
  widthAnchor?: ResizeAnchor
  depth?: number
  depthAnchor?: ResizeAnchor
}

/**
 * Unlike the 3D gizmo (pivot-centered, see useModelEditor's resizeRoom docs),
 * a 2D handle drag knows exactly which face was grabbed, so it can compute
 * genuine face-anchored resize: dragging a handle measures the new extent
 * from the *opposite* (anchor) face to the pointer.
 */
export function computeHandleResize(
  room: Room,
  handle: HandleId,
  pointerWorld: { x: number; z: number },
): HandleResizeResult {
  const minX = room.position.x - room.dimensions.width / 2
  const maxX = room.position.x + room.dimensions.width / 2
  const minZ = room.position.z - room.dimensions.depth / 2
  const maxZ = room.position.z + room.dimensions.depth / 2

  const result: HandleResizeResult = {}

  if (handle.includes('e')) {
    result.width = pointerWorld.x - minX
    result.widthAnchor = 'min'
  } else if (handle.includes('w')) {
    result.width = maxX - pointerWorld.x
    result.widthAnchor = 'max'
  }

  if (handle.includes('s')) {
    result.depth = pointerWorld.z - minZ
    result.depthAnchor = 'min'
  } else if (handle.includes('n')) {
    result.depth = maxZ - pointerWorld.z
    result.depthAnchor = 'max'
  }

  return result
}

/** Builds a centered room seed from two opposite corners dragged on the plan. */
export function computeDrawnRoomSeed(
  cornerA: { x: number; z: number },
  cornerB: { x: number; z: number },
  floorY: number,
): { position: Room['position']; dimensions: Room['dimensions'] } {
  const minX = Math.min(cornerA.x, cornerB.x)
  const maxX = Math.max(cornerA.x, cornerB.x)
  const minZ = Math.min(cornerA.z, cornerB.z)
  const maxZ = Math.max(cornerA.z, cornerB.z)

  return {
    position: { x: (minX + maxX) / 2, y: floorY, z: (minZ + maxZ) / 2 },
    dimensions: {
      width: Math.max(MIN_ROOM_DIMENSION, maxX - minX),
      height: DEFAULT_ROOM_HEIGHT,
      depth: Math.max(MIN_ROOM_DIMENSION, maxZ - minZ),
    },
  }
}
