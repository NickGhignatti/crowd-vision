import { describe, expect, it } from 'vitest'

import { topView } from './camera.ts'
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
