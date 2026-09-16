import { describe, expect, it } from 'vitest'
import type { TableBody, TableHeader } from '@/types/dashboard/table.ts'
import { buildRows, sensorKinds } from './tableRows.ts'

const room = (roomId: string, capacity: number): TableBody => ({
  roomId,
  roomName: roomId,
  roomMaxOccupancy: capacity,
  status: '',
})

const header = (metricKey: string): TableHeader => ({ key: metricKey, metricKey, label: metricKey })

const reading = (roomId: string, value: number, fields: Record<string, number> = {}) => ({
  roomId,
  timestamp: 0,
  value,
  ...fields,
})

describe('sensorKinds', () => {
  it('fetches every telemetry column, including metrics the table has never heard of', () => {
    expect(sensorKinds([header('temperature'), header('totalDeviceCount')])).toEqual(
      expect.arrayContaining(['temperature', 'totalDeviceCount']),
    )
  })

  it('never fetches what the room itself carries', () => {
    expect(sensorKinds([header('roomName'), header('roomMaxOccupancy'), header('status')])).toEqual(
      ['peopleCount'],
    )
  })

  it('always fetches people count, because status is derived from it', () => {
    expect(sensorKinds([header('temperature')])).toContain('peopleCount')
  })

  it('lists each metric once', () => {
    expect(sensorKinds([header('peopleCount')])).toEqual(['peopleCount'])
  })
})

describe('buildRows', () => {
  it('fills a column for any metric, keyed by the metric', () => {
    const [row] = buildRows([room('r1', 10)], [header('totalDeviceCount')], {
      totalDeviceCount: [reading('r1', 7)],
    })
    expect(row!.totalDeviceCount).toBe(7)
  })

  // Telemetry already copies each plugin's value field into `value`, history and live alike.
  it('reads the reading value, not a plugin field', () => {
    const [row] = buildRows([room('r1', 10)], [header('airQuality')], {
      airQuality: [reading('r1', 42.3, { indoor_aqi: 42.3, co2: 900 })],
    })
    expect(row!.airQuality).toBe(42.3)
  })

  it('rounds a reading to one decimal', () => {
    const [row] = buildRows([room('r1', 10)], [header('temperature')], {
      temperature: [reading('r1', 21.456)],
    })
    expect(row!.temperature).toBe(21.5)
  })

  it('shows a placeholder for a room with no reading yet', () => {
    const [row] = buildRows([room('r1', 10)], [header('ratioDeviceCount')], {
      ratioDeviceCount: [reading('r2', 3)],
    })
    expect(row!.ratioDeviceCount).toBe('--')
  })

  it('derives status from the live people count against max occupancy', () => {
    const [row] = buildRows([room('r1', 10)], [header('status')], {
      peopleCount: [reading('r1', 10)],
    })
    expect(row!.status).toBe('dashboard.table.rooms.status.full')
  })

  it('treats a room with no people reading as empty', () => {
    const [row] = buildRows([room('r1', 10)], [header('status')], {})
    expect(row!.status).toBe('dashboard.table.rooms.status.empty')
  })

  it('leaves room columns as the room provided them', () => {
    const [row] = buildRows([room('r1', 10)], [header('roomName'), header('roomMaxOccupancy')], {})
    expect(row).toMatchObject({ roomName: 'r1', roomMaxOccupancy: 10 })
  })
})
