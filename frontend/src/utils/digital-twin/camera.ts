import type { Coordinates, Room } from '@/types/digital-twin/building.ts'
import { groundExtent } from '@/utils/digital-twin/sensors.ts'

/** Border kept around the building in the top view, in metres. */
const TOP_VIEW_MARGIN = 5
// Headroom so the square's edges do not touch the window's.
const TOP_VIEW_PADDING = 1.1

/**
 * A camera straight above the building, high enough that its footprint plus a border fits the
 * window: the narrower of the vertical and horizontal fields of view decides the height.
 */
export function topView(
  rooms: Room[],
  verticalFovDeg: number,
  aspect: number,
): { position: Coordinates; target: Coordinates } | null {
  const extent = groundExtent(rooms, TOP_VIEW_MARGIN)
  if (!extent) return null

  const vertical = (verticalFovDeg * Math.PI) / 180
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
  const narrowest = Math.min(vertical, horizontal)
  const height = ((extent.size / 2) * TOP_VIEW_PADDING) / Math.tan(narrowest / 2)

  const { x, y, z } = extent.center
  return { position: { x, y: y + height, z }, target: { x, y, z } }
}

/** Where the camera is and what it looks at. */
export interface CameraView {
  position: Coordinates
  target: Coordinates
}

/** Smoothstep: eases into and out of motion, so a camera move neither lurches nor stops dead. */
export function easeInOut(t: number): number {
  const x = Math.min(Math.max(t, 0), 1)
  return x * x * (3 - 2 * x)
}

const lerp = (a: Coordinates, b: Coordinates, t: number): Coordinates => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/** Moves position and target together: moving only the camera would swing the view mid-move. */
export function interpolateView(from: CameraView, to: CameraView, t: number): CameraView {
  if (t <= 0) return from
  if (t >= 1) return to
  return { position: lerp(from.position, to.position, t), target: lerp(from.target, to.target, t) }
}
