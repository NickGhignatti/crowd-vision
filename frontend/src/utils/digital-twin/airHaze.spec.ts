import { describe, expect, it } from 'vitest'
import type { Room } from '@/types/digital-twin/building.ts'
import { airHazes, hazeFor } from './airHaze.ts'

const room = (id: string): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 0, y: 1.5, z: 0 },
  dimensions: { width: 4, height: 3, depth: 4 },
})

describe('the haze a room shows for its air', () => {
  it('is light and quick for clean air', () => {
    expect(hazeFor(10)).toEqual({ density: expect.closeTo(0.325), speed: expect.closeTo(1.105) })
  })

  it('is thick and slow for poor air, and no worse past 100', () => {
    expect(hazeFor(100)).toEqual({ density: 1, speed: expect.closeTo(0.25) })
    expect(hazeFor(250)).toEqual(hazeFor(100))
  })

  it('thickens and slows steadily as the air worsens', () => {
    const [good, fair] = [hazeFor(30), hazeFor(70)]
    expect(fair.density).toBeGreaterThan(good.density)
    expect(fair.speed).toBeLessThan(good.speed)
  })
})

describe('the rooms that show haze', () => {
  const rooms = [room('a'), room('b'), room('c')]

  it('gives every room on screen an entry, in order, so the layer never changes size', () => {
    expect(airHazes(rooms, { a: 40, c: 0 }).map((haze) => haze.room.id)).toEqual(['a', 'b', 'c'])
  })

  it('shows haze only in rooms with a reading, so an absent sensor paints nothing', () => {
    const lit = airHazes(rooms, { a: 40, c: 0 }).filter((haze) => haze.lit)
    expect(lit.map((haze) => haze.room.id)).toEqual(['a'])
  })

  it('shows nothing without readings, which is how the mode being off is drawn', () => {
    expect(airHazes(rooms, {}).some((haze) => haze.lit)).toBe(false)
  })
})
