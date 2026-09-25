import type { ApiDataPoint } from '@/composables/commons/useSensorData.ts'
import type { TableBody } from '@/types/dashboard/table.ts'
import type { Room } from '@/types/digital-twin/building.ts'
import { getStatusByOccupants, isAlertStatus } from '@/utils/dashboard/status.ts'

export type RowFilter = 'all' | 'occupied' | 'alerts'
export type AqiBand = 'good' | 'moderate' | 'poor'

export interface BuildingSummary {
  rooms: number
  people: number
  capacity: number
  occupancy: number | null
  averageTemperature: number | null
  averageAqi: number | null
  alerts: number
}

const EMPTY_STATUS = 'dashboard.table.rooms.status.empty'

const round = (value: number) => Math.round(value * 10) / 10

// Air quality points carry their index under whichever name the producing plugin used.
const valueOf = (point: ApiDataPoint) => point.value ?? point.indoorAqi ?? point.indoor_aqi

function valuesFor(points: ApiDataPoint[] | undefined, roomIds: Set<string>): number[] {
  return (points ?? [])
    .filter((point) => roomIds.has(point.roomId))
    .map(valueOf)
    .filter((value): value is number => typeof value === 'number')
}

const average = (values: number[]) =>
  values.length ? round(values.reduce((sum, v) => sum + v, 0) / values.length) : null

/** The building-wide figures shown above the table. */
export function summarize(
  rows: TableBody[],
  readings: Record<string, ApiDataPoint[]>,
): BuildingSummary {
  const roomIds = new Set(rows.map((row) => row.roomId))
  const people = valuesFor(readings.peopleCount, roomIds).reduce((sum, v) => sum + v, 0)
  const capacity = rows.reduce((sum, row) => sum + (row.roomMaxOccupancy || 0), 0)

  return {
    rooms: rows.length,
    people,
    capacity,
    occupancy: capacity > 0 ? people / capacity : null,
    averageTemperature: average(valuesFor(readings.temperature, roomIds)),
    averageAqi: average(valuesFor(readings.airQuality, roomIds)),
    alerts: rows.filter((row) => isAlertStatus(row.status)).length,
  }
}

export function filterRows(rows: TableBody[], query: string, filter: RowFilter): TableBody[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (filter === 'occupied' && row.status === EMPTY_STATUS) return false
    if (filter === 'alerts' && !isAlertStatus(row.status)) return false
    return (
      !needle ||
      row.roomName.toLowerCase().includes(needle) ||
      row.roomId.toLowerCase().includes(needle)
    )
  })
}

/** A building's rooms before any telemetry: nobody in them yet. */
export const roomsToRows = (rooms: Room[]): TableBody[] =>
  rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name?.trim() || room.id,
    roomMaxOccupancy: room.capacity,
    status: getStatusByOccupants(0, room.capacity),
  }))

/** Same bands the 3D twin colours rooms by. */
export function aqiBand(value: number | null): AqiBand | null {
  if (value === null) return null
  if (value < 50) return 'good'
  if (value < 100) return 'moderate'
  return 'poor'
}
