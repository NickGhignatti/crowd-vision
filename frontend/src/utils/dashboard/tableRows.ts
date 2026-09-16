import type { ApiDataPoint } from '@/composables/commons/useSensorData.ts'
import type { TableBody, TableHeader } from '@/types/dashboard/table.ts'
import { getStatusByOccupants } from '@/utils/dashboard/status'

// The room carries these itself (twin data, or derived from it); telemetry has no bucket for them.
const ROOM_METRICS = new Set(['roomName', 'roomMaxOccupancy', 'status'])
const PEOPLE = 'peopleCount'

const round = (value: number) => Math.round(value * 10) / 10

/** Telemetry metrics the table must subscribe to; people count always, because status needs it. */
export const sensorKinds = (headers: TableHeader[]): string[] => [
  ...new Set([
    PEOPLE,
    ...headers
      .map((header) => header.metricKey ?? '')
      .filter((kind) => kind && !ROOM_METRICS.has(kind)),
  ]),
]

/** One row per room: each telemetry column from its reading's `value`, status from people against capacity. */
export function buildRows(
  rooms: TableBody[],
  headers: TableHeader[],
  readings: Record<string, ApiDataPoint[]>,
): TableBody[] {
  const byRoom = new Map(
    Object.entries(readings).map(([kind, points]) => [
      kind,
      new Map(points.map((point) => [point.roomId, point])),
    ]),
  )
  const sensorHeaders = headers.filter(
    (header) => header.metricKey && !ROOM_METRICS.has(header.metricKey),
  )

  return rooms.map((room) => {
    const row: TableBody = { ...room }
    for (const header of sensorHeaders) {
      const value = byRoom.get(header.metricKey!)?.get(room.roomId)?.value
      row[header.key] = value == null ? '--' : round(value)
    }
    const people = byRoom.get(PEOPLE)?.get(room.roomId)?.value ?? 0
    row.status = getStatusByOccupants(people, room.roomMaxOccupancy)
    return row
  })
}
