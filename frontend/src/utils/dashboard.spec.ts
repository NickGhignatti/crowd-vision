import { describe, expect, it } from 'vitest'
import type { TableBody } from '@/models/table.ts'
import type { Room } from '@/models/building.ts'
import { aqiBand, filterRows, roomsToRows, summarize } from './dashboard.ts'

const STATUS = 'dashboard.table.rooms.status'

const room = (roomId: string, capacity: number, status = `${STATUS}.empty`): TableBody => ({
  roomId,
  roomName: `Room ${roomId}`,
  roomMaxOccupancy: capacity,
  status,
})

const rooms = [
  room('a', 10, `${STATUS}.normal`),
  room('b', 20, `${STATUS}.full`),
  room('c', 10, `${STATUS}.empty`),
]

const point = (roomId: string, value: number) => ({ timestamp: 0, roomId, value })

describe('the building summary above the table', () => {
  it('adds up people against the capacity of every room', () => {
    const summary = summarize(rooms, { peopleCount: [point('a', 4), point('b', 20)] })
    expect(summary).toMatchObject({ rooms: 3, people: 24, capacity: 40, occupancy: 0.6 })
  })

  it('averages temperature and air quality over the rooms that report them', () => {
    const summary = summarize(rooms, {
      temperature: [point('a', 20), point('b', 23)],
      airQuality: [point('c', 42)],
    })
    expect(summary.averageTemperature).toBe(21.5)
    expect(summary.averageAqi).toBe(42)
  })

  it('reads an air quality reading that only carries its index', () => {
    const summary = summarize(rooms, {
      airQuality: [{ timestamp: 0, roomId: 'a', indoor_aqi: 30 }],
    })
    expect(summary.averageAqi).toBe(30)
  })

  it('has no average and no occupancy when nothing reports', () => {
    const summary = summarize([], {})
    expect(summary).toMatchObject({ averageTemperature: null, averageAqi: null, occupancy: null })
  })

  it('counts full and overcrowded rooms as alerts', () => {
    expect(summarize([...rooms, room('d', 5, `${STATUS}.overcrowded`)], {}).alerts).toBe(2)
  })

  it('ignores readings for rooms that are not in the building', () => {
    expect(summarize(rooms, { peopleCount: [point('zz', 99)] }).people).toBe(0)
  })
})

describe('filtering the table rows', () => {
  it('keeps every row with no query and no filter', () => {
    expect(filterRows(rooms, '', 'all')).toHaveLength(3)
  })

  it('matches the query against room name and id, ignoring case', () => {
    expect(filterRows(rooms, 'ROOM B', 'all').map((r) => r.roomId)).toEqual(['b'])
    expect(filterRows(rooms, 'c', 'all').map((r) => r.roomId)).toEqual(['c'])
  })

  it('keeps only rooms with people in them', () => {
    expect(filterRows(rooms, '', 'occupied').map((r) => r.roomId)).toEqual(['a', 'b'])
  })

  it('keeps only rooms in alert', () => {
    expect(filterRows(rooms, '', 'alerts').map((r) => r.roomId)).toEqual(['b'])
  })
})

describe('the rows a building starts the table with', () => {
  const twinRoom = (id: string, name: string): Room => ({
    id,
    name,
    capacity: 30,
    position: { x: 0, y: 0, z: 0 },
    dimensions: { width: 1, height: 1, depth: 1 },
  })

  it('has one empty row per room, named after it', () => {
    expect(roomsToRows([twinRoom('r1', ' Lab ')])).toEqual([
      { roomId: 'r1', roomName: 'Lab', roomMaxOccupancy: 30, status: `${STATUS}.empty` },
    ])
  })

  it('falls back to the room id for a blank name', () => {
    expect(roomsToRows([twinRoom('r2', '  ')])[0]!.roomName).toBe('r2')
  })
})

describe('the band an air quality index falls in', () => {
  it.each([
    [null, null],
    [0, 'good'],
    [49, 'good'],
    [50, 'moderate'],
    [99, 'moderate'],
    [100, 'poor'],
  ])('%s reads as %s', (value, band) => {
    expect(aqiBand(value)).toBe(band)
  })
})
