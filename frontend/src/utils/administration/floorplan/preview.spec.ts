import { describe, expect, it } from 'vitest'
import { floorsByElevation, planExtent, roomOrigin } from './preview.ts'

const room = (name: string, x: number, y: number, z: number, width = 2, depth = 4) => ({
  name,
  position: { x, y, z },
  dimensions: { width, height: 3, depth },
})

describe('the floors of a drafted building', () => {
  it('groups rooms by elevation and numbers floors from the ground up', () => {
    const upper = room('upper', 0, 3, 0)
    const ground = room('ground', 0, 0, 0)
    expect(floorsByElevation([upper, ground])).toEqual([
      { index: 0, elevation: 0, rooms: [ground] },
      { index: 1, elevation: 3, rooms: [upper] },
    ])
  })
})

describe('the drawing area of the plan preview', () => {
  it('spans every room seen from above, padded on each side', () => {
    const extent = planExtent([room('a', 1, 0, 2), room('b', 5, 0, 2)], 1)
    expect(extent).toEqual({ width: 6, depth: 4, viewBox: '-1 -1 8 6' })
  })

  it('has nothing to draw without rooms', () => {
    expect(planExtent([], 1)).toBeNull()
  })
})

describe('where a room rectangle starts', () => {
  it('is the centre less half the footprint', () => {
    expect(roomOrigin(room('a', 1, 0, 2))).toEqual({ x: 0, z: 0 })
  })
})
