import type { Room } from '@/models/building.ts'

/** Rounds to the nearest multiple of `step`; non-positive steps disable snapping. */
export function snapToGrid(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/** A "floor" is a distinct `position.y` value — see buildings.qd's spatial invariants. */
export function floorLevels(rooms: Room[]): number[] {
  return Array.from(new Set(rooms.map((room) => room.position.y))).sort((a, b) => a - b)
}

export interface RoomDiff {
  added: Room[]
  removed: Room[]
  updated: Room[]
}

/** Compares the draft against the original building's rooms for the editor's Save step. */
export function diffRooms(original: Room[], draft: Room[]): RoomDiff {
  const originalById = new Map(original.map((room) => [room.id, room]))
  const draftById = new Map(draft.map((room) => [room.id, room]))

  const added = draft.filter((room) => !originalById.has(room.id))
  const removed = original.filter((room) => !draftById.has(room.id))
  const updated = draft.filter((room) => {
    const before = originalById.get(room.id)
    return before !== undefined && JSON.stringify(before) !== JSON.stringify(room)
  })

  return { added, removed, updated }
}

/** Axis-aligned box overlap test on all three dimensions; exactly-touching faces don't count. */
export function boxesOverlap(a: Room, b: Room): boolean {
  return (
    Math.abs(a.position.x - b.position.x) < (a.dimensions.width + b.dimensions.width) / 2 &&
    Math.abs(a.position.y - b.position.y) < (a.dimensions.height + b.dimensions.height) / 2 &&
    Math.abs(a.position.z - b.position.z) < (a.dimensions.depth + b.dimensions.depth) / 2
  )
}

export interface SnapGuide {
  axis: 'x' | 'z'
  value: number
}

export interface SnapResult {
  x: number
  z: number
  guides: SnapGuide[]
}

const DEFAULT_SNAP_THRESHOLD = 0.75

// Snaps one axis of `room` to the nearest neighbor edge/center within `threshold`, trying
// every (room line, neighbor line) pair — each "line" being a min/center/max face — and keeping the closest.
function snapAxis(
  axis: 'x' | 'z',
  roomCenter: number,
  roomHalfExtent: number,
  neighbors: Room[],
  threshold: number,
): { value: number; guide: SnapGuide } | null {
  const roomLines = [roomCenter - roomHalfExtent, roomCenter, roomCenter + roomHalfExtent]
  let best: { delta: number; guideValue: number } | null = null

  for (const neighbor of neighbors) {
    const neighborCenter = axis === 'x' ? neighbor.position.x : neighbor.position.z
    const neighborHalfExtent =
      (axis === 'x' ? neighbor.dimensions.width : neighbor.dimensions.depth) / 2
    const neighborLines = [
      neighborCenter - neighborHalfExtent,
      neighborCenter,
      neighborCenter + neighborHalfExtent,
    ]

    for (const roomLine of roomLines) {
      for (const neighborLine of neighborLines) {
        const delta = neighborLine - roomLine
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, guideValue: neighborLine }
        }
      }
    }
  }

  if (!best) return null
  return { value: roomCenter + best.delta, guide: { axis, value: best.guideValue } }
}

/** Smart-guide snapping (Figma-style): aligns the moving room's edges/center to a nearby
 * room's on the same floor within `threshold`; returns snapped X/Z plus guide lines to draw. */
export function snapToNeighbors(
  room: Room,
  allRooms: Room[],
  threshold: number = DEFAULT_SNAP_THRESHOLD,
): SnapResult {
  const neighbors = allRooms.filter((r) => r.id !== room.id && r.position.y === room.position.y)

  const xSnap = snapAxis('x', room.position.x, room.dimensions.width / 2, neighbors, threshold)
  const zSnap = snapAxis('z', room.position.z, room.dimensions.depth / 2, neighbors, threshold)

  const guides: SnapGuide[] = []
  if (xSnap) guides.push(xSnap.guide)
  if (zSnap) guides.push(zSnap.guide)

  return {
    x: xSnap ? xSnap.value : room.position.x,
    z: zSnap ? zSnap.value : room.position.z,
    guides,
  }
}

const boxExtents = (room: Room) => ({
  minX: room.position.x - room.dimensions.width / 2,
  maxX: room.position.x + room.dimensions.width / 2,
  minY: room.position.y - room.dimensions.height / 2,
  maxY: room.position.y + room.dimensions.height / 2,
  minZ: room.position.z - room.dimensions.depth / 2,
  maxZ: room.position.z + room.dimensions.depth / 2,
})

/** Union bounding box of two rooms — the geometry behind "merge two rooms". */
export function mergeBoxes(
  a: Room,
  b: Room,
): { position: Room['position']; dimensions: Room['dimensions'] } {
  const boxA = boxExtents(a)
  const boxB = boxExtents(b)

  const minX = Math.min(boxA.minX, boxB.minX)
  const maxX = Math.max(boxA.maxX, boxB.maxX)
  const minY = Math.min(boxA.minY, boxB.minY)
  const maxY = Math.max(boxA.maxY, boxB.maxY)
  const minZ = Math.min(boxA.minZ, boxB.minZ)
  const maxZ = Math.max(boxA.maxZ, boxB.maxZ)

  return {
    position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    dimensions: { width: maxX - minX, height: maxY - minY, depth: maxZ - minZ },
  }
}

/** A loose "do these two rooms share a wall" heuristic for the merge command's non-blocking
 * warning: true if they overlap, or if one axis touches within `tolerance` while the other overlaps. */
export function boxesAreAdjacent(a: Room, b: Room, tolerance = 0.1): boolean {
  if (a.position.y !== b.position.y) return false
  if (boxesOverlap(a, b)) return true

  const boxA = boxExtents(a)
  const boxB = boxExtents(b)
  const rangesOverlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    aMin < bMax && aMax > bMin

  const xGap = Math.max(boxB.minX - boxA.maxX, boxA.minX - boxB.maxX)
  const zGap = Math.max(boxB.minZ - boxA.maxZ, boxA.minZ - boxB.maxZ)

  const touchingOnX = xGap <= tolerance && rangesOverlap(boxA.minZ, boxA.maxZ, boxB.minZ, boxB.maxZ)
  const touchingOnZ = zGap <= tolerance && rangesOverlap(boxA.minX, boxA.maxX, boxB.minX, boxB.maxX)

  return touchingOnX || touchingOnZ
}

const DEFAULT_FLOOR_SNAP_THRESHOLD = 1.5

/** Magnetic Y snapping for vertical moves: within `threshold` of an existing floor level, snap
 * onto it (avoids sliver half-floors); beyond that, pass the raw value through for a deliberate new floor. */
export function snapToNearestFloorLevel(
  y: number,
  levels: number[],
  threshold: number = DEFAULT_FLOOR_SNAP_THRESHOLD,
): number {
  if (levels.length === 0) return y

  let closest = levels[0]!
  let closestDistance = Math.abs(y - closest)
  for (const level of levels) {
    const distance = Math.abs(y - level)
    if (distance < closestDistance) {
      closest = level
      closestDistance = distance
    }
  }

  return closestDistance <= threshold ? closest : y
}

const MAX_PLACEMENT_ATTEMPTS = 40

/** A simple line-search for "Add Room": walks grid slots outward from the origin until one
 * doesn't overlap; gives up and returns the origin after too many attempts (overlap here is non-blocking). */
export function findFreeSpot(
  existingRooms: Room[],
  floorY: number,
  dimensions: Room['dimensions'],
  gridStep: number,
): Room['position'] {
  const sameFloor = existingRooms.filter((r) => r.position.y === floorY)

  for (let i = 0; i < MAX_PLACEMENT_ATTEMPTS; i++) {
    const x = i * gridStep
    const candidate: Room = {
      id: '',
      name: '',
      capacity: 0,
      position: { x, y: floorY, z: 0 },
      dimensions,
    }
    if (!sameFloor.some((r) => boxesOverlap(candidate, r))) {
      return { x, y: floorY, z: 0 }
    }
  }

  return { x: 0, y: floorY, z: 0 }
}
