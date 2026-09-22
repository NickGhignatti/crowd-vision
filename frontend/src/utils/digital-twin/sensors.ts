import type { Coordinates, Room } from '@/types/digital-twin/building.ts'
import type { Placement, PlacedSensor, Sensor } from '@/types/digital-twin/sensor.ts'

/** Spacing of the placement grid, in metres. */
export const GRID_STEP = 0.5

const ICONS: Record<string, string> = {
  router: 'wifi-high',
  temperature: 'thermometer',
  peopleCount: 'users',
  airQuality: 'wind',
}
const GENERIC_ICON = 'cpu'

// A room position is the box centre on every axis, as snapRooms.ts also assumes.
const holds = (room: Room, point: Coordinates): boolean => {
  const { position, dimensions } = room
  return (
    Math.abs(point.x - position.x) <= dimensions.width / 2 &&
    Math.abs(point.y - position.y) <= dimensions.height / 2 &&
    Math.abs(point.z - position.z) <= dimensions.depth / 2
  )
}

/** The room a point sits in, or `null` for a point outside every room. */
export function roomAt(point: Coordinates, rooms: Room[]): string | null {
  return rooms.find((room) => holds(room, point))?.id ?? null
}

/** Rounds every axis to the nearest `step`; a step of zero or less leaves the point alone. */
export function snapToGrid(point: Coordinates, step: number = GRID_STEP): Coordinates {
  if (!(step > 0)) return { ...point }
  // Adding zero turns a rounded -0 back into 0, which reads better in a coordinate field.
  const snap = (value: number) => Math.round(value / step) * step + 0
  return { x: snap(point.x), y: snap(point.y), z: snap(point.z) }
}

/** Each sensor type present, with how many carry it, ordered by type. */
export function groupByType(sensors: Sensor[]): { sensorType: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const sensor of sensors) {
    counts.set(sensor.sensorType, (counts.get(sensor.sensorType) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([sensorType, count]) => ({ sensorType, count }))
    .sort((a, b) => a.sensorType.localeCompare(b.sensorType))
}

/** Selecting nothing shows everything, so an untouched filter hides no sensor. */
export function filterByTypes(sensors: Sensor[], active: Set<string>): Sensor[] {
  if (active.size === 0) return sensors
  return sensors.filter((sensor) => active.has(sensor.sensorType))
}

/** An icon name for a sensor type; an unknown type still gets one. */
export function sensorIcon(sensorType: string): string {
  return ICONS[sensorType] ?? GENERIC_ICON
}

/** Telemetry's sensors with twin's positions; a placement whose sensor is gone is dropped. */
export function joinSensorsWithPlacements(
  sensors: Sensor[],
  placements: Placement[],
): PlacedSensor[] {
  const positions = new Map(placements.map((placement) => [placement.sensorId, placement.position]))
  return sensors.map((sensor) => ({
    ...sensor,
    position: positions.get(sensor.sensorId) ?? null,
  }))
}

/** How far a room's sensor badge floats above its ceiling, in metres. */
const BADGE_LIFT = 0.4

export interface SensorBadge {
  roomId: string
  count: number
  anchor: Coordinates
}

/** One badge per drawn room holding at least one sensor, placed above its ceiling centre. */
export function sensorBadges(rooms: Room[], sensors: { roomId: string | null }[]): SensorBadge[] {
  const counts = new Map<string, number>()
  for (const { roomId } of sensors) {
    if (roomId) counts.set(roomId, (counts.get(roomId) ?? 0) + 1)
  }

  return rooms.flatMap((room) => {
    const count = counts.get(room.id)
    if (!count) return []
    const { position, dimensions } = room
    return [
      {
        roomId: room.id,
        count,
        anchor: {
          x: position.x,
          y: position.y + dimensions.height / 2 + BADGE_LIFT,
          z: position.z,
        },
      },
    ]
  })
}

/** How far the placement ground reaches past the building on every side, in metres. */
export const GROUND_MARGIN = 20

export interface GroundExtent {
  /** Centre of the square, at the building's lowest floor. */
  center: Coordinates
  /** Side of the square, in whole metres. */
  size: number
}

/** A square of ground around every room, so a sensor can be placed outside the building. */
export function groundExtent(rooms: Room[], margin: number = GROUND_MARGIN): GroundExtent | null {
  if (rooms.length === 0) return null

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let floor = Infinity
  for (const { position, dimensions } of rooms) {
    minX = Math.min(minX, position.x - dimensions.width / 2)
    maxX = Math.max(maxX, position.x + dimensions.width / 2)
    minZ = Math.min(minZ, position.z - dimensions.depth / 2)
    maxZ = Math.max(maxZ, position.z + dimensions.depth / 2)
    floor = Math.min(floor, position.y - dimensions.height / 2)
  }

  return {
    center: { x: (minX + maxX) / 2, y: floor, z: (minZ + maxZ) / 2 },
    size: Math.ceil(Math.max(maxX - minX, maxZ - minZ) + 2 * margin),
  }
}

const AXES = ['x', 'y', 'z'] as const

/** Snaps only the axes that run along the surface, so a point on a wall stays on the wall. */
export function snapOnSurface(
  point: Coordinates,
  normal: Coordinates,
  step: number = GRID_STEP,
): Coordinates {
  const snapped = snapToGrid(point, step)
  const result = { ...point }
  for (const axis of AXES) {
    if (Math.abs(normal[axis]) < 0.5) result[axis] = snapped[axis]
  }
  return result
}

// How far behind the hit face to look for the room, in metres: well inside a wall's thickness.
const SURFACE_DEPTH = 0.05

/** The room behind a surface point; a sensor on a ceiling or outer wall belongs to that room. */
export function roomBehind(point: Coordinates, normal: Coordinates, rooms: Room[]): string | null {
  return roomAt(
    {
      x: point.x - normal.x * SURFACE_DEPTH,
      y: point.y - normal.y * SURFACE_DEPTH,
      z: point.z - normal.z * SURFACE_DEPTH,
    },
    rooms,
  )
}

/**
 * Moves a point one step for an arrow key: left/right along x, up/down along z, and with
 * shift up/down change height. `null` for any other key, so callers leave it alone.
 */
export function nudge(
  point: Coordinates,
  key: string,
  shift: boolean,
  step: number = GRID_STEP,
): Coordinates | null {
  const moves: Record<string, Partial<Coordinates>> = shift
    ? { ArrowUp: { y: step }, ArrowDown: { y: -step } }
    : {
        ArrowRight: { x: step },
        ArrowLeft: { x: -step },
        ArrowUp: { z: -step },
        ArrowDown: { z: step },
      }
  const move = moves[key]
  if (!move) return null
  return {
    x: point.x + (move.x ?? 0),
    y: point.y + (move.y ?? 0),
    z: point.z + (move.z ?? 0),
  }
}
