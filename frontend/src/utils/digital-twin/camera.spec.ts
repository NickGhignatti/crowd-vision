import { describe, expect, it } from 'vitest'

import { easeInOut, interpolateView, topView } from './camera.ts'
import type { Room } from '@/types/digital-twin/building.ts'

const room = (id: string, x: number, width: number): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x, y: 1.5, z: 0 },
  dimensions: { width, height: 3, depth: 4 },
})

describe('topView', () => {
  it('is null for a building with no rooms', () => {
    expect(topView([], 50, 1)).toBeNull()
  })

  it('looks straight down at the centre of the footprint', () => {
    const view = topView([room('r1', 0, 4), room('r2', 10, 4)], 50, 1.5)!
    expect(view.target).toEqual({ x: 5, y: 0, z: 0 })
    expect(view.position.x).toBe(5)
    expect(view.position.z).toBe(0)
    expect(view.position.y).toBeGreaterThan(0)
  })

  it('rises higher for a bigger building', () => {
    const small = topView([room('r1', 0, 4)], 50, 1.5)!
    const big = topView([room('r1', 0, 40)], 50, 1.5)!
    expect(big.position.y).toBeGreaterThan(small.position.y)
  })

  it('rises higher in a narrow window, which sees less across', () => {
    const wide = topView([room('r1', 0, 10)], 50, 2)!
    const narrow = topView([room('r1', 0, 10)], 50, 0.5)!
    expect(narrow.position.y).toBeGreaterThan(wide.position.y)
  })
})

describe('easeInOut', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
  })

  it('is halfway at the middle, and symmetric around it', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1)
  })

  it('starts and ends gently, so the camera does not jerk into motion', () => {
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(0.9)).toBeGreaterThan(0.9)
  })

  it('clamps progress outside 0..1', () => {
    expect(easeInOut(-1)).toBe(0)
    expect(easeInOut(2)).toBe(1)
  })
})

describe('interpolateView', () => {
  const from = { position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 } }
  const to = { position: { x: 10, y: 20, z: -10 }, target: { x: 4, y: 0, z: 2 } }

  it('is the start at 0 and the end at 1', () => {
    expect(interpolateView(from, to, 0)).toEqual(from)
    expect(interpolateView(from, to, 1)).toEqual(to)
  })

  it('moves the camera and what it looks at together', () => {
    expect(interpolateView(from, to, 0.5)).toEqual({
      position: { x: 5, y: 15, z: -5 },
      target: { x: 2, y: 0, z: 1 },
    })
  })
})
