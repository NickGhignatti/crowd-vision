import { describe, expect, it } from 'vitest'

import {
  clampToGround,
  filterByTypes,
  groundExtent,
  groupByType,
  joinSensorsWithPlacements,
  nudge,
  roomAt,
  roomBehind,
  sensorBadges,
  sensorIcon,
  snapOnSurface,
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

  it("gives a router its own icon, not a metric's", () => {
    expect(sensorIcon('router')).not.toBe(sensorIcon('unheard-of'))
    expect(sensorIcon('router')).not.toBe(sensorIcon('peopleCount'))
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

describe('sensorBadges', () => {
  const inRoom = (roomId: string | null) => ({ roomId })

  it('counts the sensors of each room that has any', () => {
    const badges = sensorBadges(rooms, [inRoom('r1'), inRoom('r1'), inRoom('r2')])
    expect(badges.map(({ roomId, count }) => [roomId, count])).toEqual([
      ['r1', 2],
      ['r2', 1],
    ])
  })

  it('leaves out a room with no sensors', () => {
    expect(sensorBadges(rooms, [inRoom('r2')]).map((badge) => badge.roomId)).toEqual(['r2'])
  })

  it('ignores sensors outside every room and rooms not being drawn', () => {
    expect(sensorBadges(rooms, [inRoom(null), inRoom('r-other-floor')])).toEqual([])
  })

  it('floats the badge just above the centre of the ceiling', () => {
    // r1 is centred at y 1.5 with height 3, so its ceiling sits at y 3.
    const [badge] = sensorBadges(rooms, [inRoom('r1')])
    expect(badge.anchor.x).toBe(0)
    expect(badge.anchor.z).toBe(0)
    expect(badge.anchor.y).toBeGreaterThan(3)
    expect(badge.anchor.y).toBeLessThan(4)
  })
})

describe('groundExtent', () => {
  // rooms: r1 spans x -2..2, r2 spans x 8..12; both z -2..2, floor at y 0.

  it('is null for a building with no rooms', () => {
    expect(groundExtent([])).toBeNull()
  })

  it('is centred on the footprint', () => {
    const ground = groundExtent(rooms, 10)!
    expect(ground.center).toEqual({ x: 5, y: 0, z: 0 })
  })

  it('is a square reaching the margin past the widest side', () => {
    // Footprint is 14 wide and 4 deep; 14 + 2 * 10 = 34.
    expect(groundExtent(rooms, 10)!.size).toBe(34)
  })

  it('rounds its size up to whole metres so grid lines land on metres', () => {
    expect(groundExtent(rooms, 10.3)!.size).toBe(35)
  })

  it('lies at the lowest floor of the building', () => {
    const basement = { ...room('b0', 0, 0), position: { x: 0, y: -1.5, z: 0 } }
    expect(groundExtent([...rooms, basement], 10)!.center.y).toBe(-3)
  })
})

describe('snapOnSurface', () => {
  const up = { x: 0, y: 1, z: 0 }
  const east = { x: 1, y: 0, z: 0 }

  it('snaps a point on the ground along x and z but keeps its height', () => {
    expect(snapOnSurface({ x: 1.26, y: 0.013, z: -2.7 }, up, 0.5)).toEqual({
      x: 1.5,
      y: 0.013,
      z: -2.5,
    })
  })

  it('keeps a point on a wall on that wall', () => {
    // The wall faces east at x 2; snapping must not move the point off x 2.
    expect(snapOnSurface({ x: 2, y: 1.26, z: 0.74 }, east, 0.5)).toEqual({ x: 2, y: 1.5, z: 0.5 })
  })
})

describe('roomBehind', () => {
  const up = { x: 0, y: 1, z: 0 }
  const east = { x: 1, y: 0, z: 0 }

  it('names the room whose ceiling was hit', () => {
    expect(roomBehind({ x: 0, y: 3, z: 0 }, up, rooms)).toBe('r1')
  })

  it('names the room whose outer wall was hit', () => {
    expect(roomBehind({ x: 2, y: 1, z: 0 }, east, rooms)).toBe('r1')
  })

  it('names no room for a point on open ground', () => {
    expect(roomBehind({ x: 5, y: 0, z: 0 }, up, rooms)).toBeNull()
  })
})

describe('nudge', () => {
  const at = { x: 1, y: 2, z: 3 }

  it('moves along x with left and right', () => {
    expect(nudge(at, 'ArrowRight', false, 0.5)).toEqual({ x: 1.5, y: 2, z: 3 })
    expect(nudge(at, 'ArrowLeft', false, 0.5)).toEqual({ x: 0.5, y: 2, z: 3 })
  })

  it('moves along z with up and down', () => {
    expect(nudge(at, 'ArrowUp', false, 0.5)).toEqual({ x: 1, y: 2, z: 2.5 })
    expect(nudge(at, 'ArrowDown', false, 0.5)).toEqual({ x: 1, y: 2, z: 3.5 })
  })

  it('changes height with shift and up or down', () => {
    expect(nudge(at, 'ArrowUp', true, 0.5)).toEqual({ x: 1, y: 2.5, z: 3 })
    expect(nudge(at, 'ArrowDown', true, 0.5)).toEqual({ x: 1, y: 1.5, z: 3 })
  })

  it('ignores any other key', () => {
    expect(nudge(at, 'Enter', false, 0.5)).toBeNull()
  })
})

describe('clampToGround', () => {
  // rooms sit on the floor at y 0.

  it('lifts a point that ended up below the building', () => {
    expect(clampToGround({ x: 1, y: -4, z: 2 }, rooms)).toEqual({ x: 1, y: 0, z: 2 })
  })

  it('leaves a point at or above the floor alone', () => {
    expect(clampToGround({ x: 1, y: 0, z: 2 }, rooms)).toEqual({ x: 1, y: 0, z: 2 })
    expect(clampToGround({ x: 1, y: 2.5, z: 2 }, rooms)).toEqual({ x: 1, y: 2.5, z: 2 })
  })

  it('uses the lowest floor, so a basement can still hold sensors', () => {
    const basement = { ...room('b0', 0, 0), position: { x: 0, y: -1.5, z: 0 } }
    expect(clampToGround({ x: 0, y: -5, z: 0 }, [...rooms, basement]).y).toBe(-3)
  })

  it('leaves a point alone when the building has no rooms', () => {
    expect(clampToGround({ x: 1, y: -4, z: 2 }, [])).toEqual({ x: 1, y: -4, z: 2 })
  })
})
