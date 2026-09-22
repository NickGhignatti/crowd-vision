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
