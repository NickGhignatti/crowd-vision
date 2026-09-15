import { describe, expect, it } from 'vitest'
import type { TableBody, TableHeader } from '@/models/table.ts'
import { buildRows, sensorKinds } from './tableRows.ts'

const room = (roomId: string, capacity: number): TableBody => ({
  room: roomId,
  roomId,
  status: '',
  teacher: '',
  temp: '',
  people: '0',
  capacity: String(capacity),
})

const header = (metricKey: string, key = metricKey): TableHeader => ({
  key,
  metricKey,
  label: metricKey,
})

const reading = (roomId: string, value: number, fields: Record<string, number> = {}) => ({
  roomId,
  timestamp: 0,
  value,
  ...fields,
})

describe('sensorKinds', () => {
  it('fetches every telemetry column, including metrics the table has never heard of', () => {
    expect(sensorKinds([header('temperature', 'temp'), header('totalDeviceCount')])).toEqual(
      expect.arrayContaining(['temperature', 'totalDeviceCount']),
    )
  })

  it('never fetches what the room itself carries', () => {
    expect(
      sensorKinds([
        header('roomName', 'room'),
        header('roomMaxOccupancy', 'capacity'),
        header('status'),
      ]),
    ).toEqual(['peopleCount'])
  })

  it('always fetches people count, because status is derived from it', () => {
    expect(sensorKinds([header('temperature', 'temp')])).toContain('peopleCount')
  })

  it('lists each metric once', () => {
    expect(sensorKinds([header('peopleCount', 'people')])).toEqual(['peopleCount'])
  })
})

describe('buildRows', () => {
  it('fills a column for a metric the table has no mapping for', () => {
    const [row] = buildRows([room('r1', 10)], [header('totalDeviceCount')], {
      totalDeviceCount: [reading('r1', 7)],
    })
    expect(row!.totalDeviceCount).toBe(7)
  })

  it('writes under the header key, not the metric key', () => {
    const [row] = buildRows([room('r1', 10)], [header('temperature', 'temp')], {
      temperature: [reading('r1', 21.5)],
    })
    expect(row!.temp).toBe(21.5)
  })

  // Telemetry already copies each plugin's value field into `value`, history and live alike.
  it('reads the reading value, not a plugin field', () => {
    const [row] = buildRows([room('r1', 10)], [header('airQuality', 'indoorAqi')], {
      airQuality: [reading('r1', 42.3, { indoor_aqi: 42.3, co2: 900 })],
    })
    expect(row!.indoorAqi).toBe(42.3)
  })

  it('rounds a reading to one decimal', () => {
    const [row] = buildRows([room('r1', 10)], [header('temperature', 'temp')], {
      temperature: [reading('r1', 21.456)],
    })
    expect(row!.temp).toBe(21.5)
  })

  it('shows a placeholder for a room with no reading yet', () => {
    const [row] = buildRows([room('r1', 10)], [header('ratioDeviceCount')], {
      ratioDeviceCount: [reading('r2', 3)],
    })
    expect(row!.ratioDeviceCount).toBe('--')
  })

  it('derives status from the live people count against capacity', () => {
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
    const [row] = buildRows(
      [room('r1', 10)],
      [header('roomName', 'room'), header('roomMaxOccupancy', 'capacity')],
      {},
    )
    expect(row).toMatchObject({ room: 'r1', capacity: '10' })
  })
})
