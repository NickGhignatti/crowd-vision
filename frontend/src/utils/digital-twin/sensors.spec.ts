import { describe, expect, it } from 'vitest'

import {
  filterByTypes,
  groupByType,
  joinSensorsWithPlacements,
  roomAt,
  sensorIcon,
  snapToGrid,
} from './sensors.ts'
import type { Room } from '@/types/digital-twin/building.ts'
import type { Placement, Sensor } from '@/types/digital-twin/sensor.ts'

const room = (id: string, x: number, z: number): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x, y: 1.5, z },
  dimensions: { width: 4, height: 3, depth: 4 },
})

const rooms = [room('r1', 0, 0), room('r2', 10, 0)]

const sensor = (sensorId: string, sensorType: string, roomId: string | null = null): Sensor => ({
  sensorId,
  buildingId: 'b1',
  name: `Sensor ${sensorId}`,
  sensorType,
  roomId,
  actions: [],
})

const placement = (sensorId: string, x: number): Placement => ({
  sensorId,
  position: { x, y: 0, z: 0 },
})

describe('roomAt', () => {
  it('names the room a point sits inside', () => {
    expect(roomAt({ x: 0, y: 1, z: 0 }, rooms)).toBe('r1')
    expect(roomAt({ x: 10.5, y: 0.5, z: 1 }, rooms)).toBe('r2')
  })

  it('returns null for a point outside every room', () => {
    expect(roomAt({ x: 5, y: 1, z: 0 }, rooms)).toBeNull()
    expect(roomAt({ x: 0, y: 1, z: 0 }, [])).toBeNull()
  })

  it('measures a room from its centre, not its corner', () => {
    // r1 spans x -2..2, y 0..3, z -2..2 around its centre.
    expect(roomAt({ x: 1.9, y: 2.9, z: -1.9 }, rooms)).toBe('r1')
    expect(roomAt({ x: 2.1, y: 1, z: 0 }, rooms)).toBeNull()
  })

  it('counts a point above the ceiling or below the floor as outside', () => {
    expect(roomAt({ x: 0, y: 3.1, z: 0 }, rooms)).toBeNull()
    expect(roomAt({ x: 0, y: -0.1, z: 0 }, rooms)).toBeNull()
  })

  it('takes the first room when two overlap', () => {
    const overlapping = [room('r1', 0, 0), room('r2', 1, 0)]
    expect(roomAt({ x: 0.5, y: 1, z: 0 }, overlapping)).toBe('r1')
  })
})

describe('snapToGrid', () => {
  it('rounds every axis to the nearest step', () => {
    expect(snapToGrid({ x: 1.24, y: 0.3, z: -1.26 }, 0.5)).toEqual({ x: 1, y: 0.5, z: -1.5 })
  })

  it('leaves a point alone when the step is not positive', () => {
    const point = { x: 1.23, y: 0.31, z: -1.26 }
    expect(snapToGrid(point, 0)).toEqual(point)
    expect(snapToGrid(point, -1)).toEqual(point)
  })

  it('never returns negative zero', () => {
    expect(Object.is(snapToGrid({ x: -0.1, y: 0, z: 0 }, 0.5).x, 0)).toBe(true)
  })
})

describe('groupByType', () => {
  it('counts each type present, ordered by type', () => {
    const sensors = [
      sensor('s1', 'temperature'),
      sensor('s2', 'peopleCount'),
      sensor('s3', 'temperature'),
    ]
    expect(groupByType(sensors)).toEqual([
      { sensorType: 'peopleCount', count: 1 },
      { sensorType: 'temperature', count: 2 },
    ])
  })

  it('is empty for no sensors', () => {
    expect(groupByType([])).toEqual([])
  })
})

describe('filterByTypes', () => {
  const sensors = [sensor('s1', 'temperature'), sensor('s2', 'peopleCount')]

  it('keeps every sensor when nothing is selected', () => {
    expect(filterByTypes(sensors, new Set())).toEqual(sensors)
  })

  it('keeps only the selected types', () => {
    expect(filterByTypes(sensors, new Set(['peopleCount']))).toEqual([sensors[1]])
  })

  it('accepts a type no sensor has', () => {
    expect(filterByTypes(sensors, new Set(['humidity']))).toEqual([])
  })
})

describe('sensorIcon', () => {
  it('names an icon for a known type', () => {
    expect(sensorIcon('temperature')).not.toBe(sensorIcon('unheard-of'))
  })

  it('falls back to a generic icon for a type it does not know', () => {
    expect(sensorIcon('unheard-of')).toBe(sensorIcon('also-unknown'))
    expect(sensorIcon('unheard-of')).toBeTruthy()
  })
})

describe('joinSensorsWithPlacements', () => {
  it('gives each sensor its position', () => {
    const joined = joinSensorsWithPlacements([sensor('s1', 'temperature')], [placement('s1', 4)])
    expect(joined[0].position).toEqual({ x: 4, y: 0, z: 0 })
  })

  it('leaves a sensor with no placement unplaced', () => {
    const joined = joinSensorsWithPlacements([sensor('s1', 'temperature')], [])
    expect(joined[0].position).toBeNull()
  })

  it('drops a placement whose sensor is gone', () => {
    const joined = joinSensorsWithPlacements([sensor('s1', 'temperature')], [placement('ghost', 4)])
    expect(joined).toHaveLength(1)
    expect(joined[0].sensorId).toBe('s1')
  })

  it('keeps the sensor order it was given', () => {
    const joined = joinSensorsWithPlacements(
      [sensor('s2', 'temperature'), sensor('s1', 'temperature')],
      [placement('s1', 1)],
    )
    expect(joined.map((s) => s.sensorId)).toEqual(['s2', 's1'])
  })
})
