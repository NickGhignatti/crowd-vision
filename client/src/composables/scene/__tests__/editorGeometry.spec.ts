import { describe, it, expect } from 'vitest'
import {
  snapToGrid,
  floorLevels,
  diffRooms,
  boxesOverlap,
  snapToNeighbors,
  mergeBoxes,
  boxesAreAdjacent,
  findFreeSpot,
} from '@/composables/scene/editorGeometry.ts'
import type { Room } from '@/models/building.ts'

const makeRoom = (id: string, overrides: Partial<Room> = {}): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 0, y: 0, z: 0 },
  dimensions: { width: 1, height: 1, depth: 1 },
  ...overrides,
})

describe('snapToGrid', () => {
  it('rounds to the nearest multiple of step', () => {
    expect(snapToGrid(1.3, 0.5)).toBe(1.5)
    expect(snapToGrid(1.1, 0.5)).toBe(1)
    expect(snapToGrid(2.2, 0.5)).toBe(2)
  })

  it('is a no-op for values already on the grid', () => {
    expect(snapToGrid(2, 0.5)).toBe(2)
  })

  it('returns the raw value when step is zero or negative', () => {
    expect(snapToGrid(1.234, 0)).toBe(1.234)
    expect(snapToGrid(1.234, -1)).toBe(1.234)
  })
})

describe('floorLevels', () => {
  it('returns the sorted unique set of y positions', () => {
    const rooms = [
      makeRoom('a', { position: { x: 0, y: 3, z: 0 } }),
      makeRoom('b', { position: { x: 0, y: 0, z: 0 } }),
      makeRoom('c', { position: { x: 0, y: 3, z: 0 } }),
    ]
    expect(floorLevels(rooms)).toEqual([0, 3])
  })

  it('returns an empty array for no rooms', () => {
    expect(floorLevels([])).toEqual([])
  })
})

describe('diffRooms', () => {
  it('detects added rooms', () => {
    const original = [makeRoom('a')]
    const draft = [makeRoom('a'), makeRoom('b')]
    const diff = diffRooms(original, draft)
    expect(diff.added.map((r) => r.id)).toEqual(['b'])
    expect(diff.removed).toEqual([])
    expect(diff.updated).toEqual([])
  })

  it('detects removed rooms', () => {
    const original = [makeRoom('a'), makeRoom('b')]
    const draft = [makeRoom('a')]
    const diff = diffRooms(original, draft)
    expect(diff.removed.map((r) => r.id)).toEqual(['b'])
    expect(diff.added).toEqual([])
  })

  it('detects updated rooms by deep content change', () => {
    const original = [makeRoom('a')]
    const draft = [makeRoom('a', { position: { x: 5, y: 0, z: 0 } })]
    const diff = diffRooms(original, draft)
    expect(diff.updated.map((r) => r.id)).toEqual(['a'])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('reports no changes for an untouched set', () => {
    const original = [makeRoom('a'), makeRoom('b')]
    const draft = [makeRoom('a'), makeRoom('b')]
    const diff = diffRooms(original, draft)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.updated).toEqual([])
  })
})

describe('boxesOverlap', () => {
  it('detects two clearly overlapping rooms', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    const b = makeRoom('b', { position: { x: 1, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    expect(boxesOverlap(a, b)).toBe(true)
  })

  it('does not flag two rooms exactly touching edge-to-edge', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    const b = makeRoom('b', { position: { x: 4, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    expect(boxesOverlap(a, b)).toBe(false)
  })

  it('does not flag two rooms far apart', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 2, height: 2, depth: 2 } })
    const b = makeRoom('b', { position: { x: 50, y: 0, z: 0 }, dimensions: { width: 2, height: 2, depth: 2 } })
    expect(boxesOverlap(a, b)).toBe(false)
  })

  it('does not flag rooms that overlap in X/Z but not Y (different floors, no vertical overlap)', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    const b = makeRoom('b', { position: { x: 0, y: 10, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    expect(boxesOverlap(a, b)).toBe(false)
  })
})

describe('snapToNeighbors', () => {
  const neighbor = makeRoom('neighbor', {
    position: { x: 10, y: 0, z: 0 },
    dimensions: { width: 4, height: 2, depth: 4 },
  })

  it('snaps a room edge to a neighbor edge within threshold', () => {
    // neighbor's min-X face is at 10 - 2 = 8. Room (width 2, half=1) approaching
    // with its own max-X face near 8 should snap so that face lands exactly on 8.
    const moving = makeRoom('moving', {
      position: { x: 6.7, y: 0, z: 0 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, neighbor])

    // moving's max face (position.x + 1) should land on neighbor's min face (8),
    // so the new center is 7.
    expect(result.x).toBe(7)
    expect(result.guides.some((g) => g.axis === 'x' && g.value === 8)).toBe(true)
  })

  it('does not snap when beyond the threshold', () => {
    // z is pushed away from the neighbor's z=0 too, so only the X axis (the
    // one under test) is exercised — otherwise the default z=0/z=0 alignment
    // would spuriously "snap" on Z.
    const moving = makeRoom('moving', {
      position: { x: 3, y: 0, z: 50 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, neighbor])

    expect(result.x).toBe(3)
    expect(result.guides).toEqual([])
  })

  it('snaps center-to-center alignment', () => {
    const moving = makeRoom('moving', {
      position: { x: 0, y: 0, z: 0.3 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, neighbor])

    expect(result.z).toBe(0)
    expect(result.guides.some((g) => g.axis === 'z' && g.value === 0)).toBe(true)
  })

  it('picks the nearest candidate when multiple neighbors are in range', () => {
    // Tiny widths collapse each neighbor's min/max/center lines to effectively
    // one point, so this isolates center-to-center distance as the only factor:
    // neighborNear's center (1.3) is closer to moving's line at x=1 than
    // neighborFar's (1.6) is, so neighborNear must win.
    const neighborNear = makeRoom('near', {
      position: { x: 1.3, y: 0, z: 50 },
      dimensions: { width: 0.01, height: 2, depth: 0.01 },
    })
    const neighborFar = makeRoom('far', {
      position: { x: 1.6, y: 0, z: 50 },
      dimensions: { width: 0.01, height: 2, depth: 0.01 },
    })
    const moving = makeRoom('moving', {
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, neighborNear, neighborFar])

    expect(result.x).toBeCloseTo(0.295, 5)
    expect(result.guides.some((g) => g.axis === 'x' && Math.abs(g.value - 1.295) < 1e-9)).toBe(true)
  })

  it('ignores neighbors on a different floor', () => {
    const otherFloorNeighbor = makeRoom('other-floor', {
      position: { x: 0.3, y: 5, z: 0 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })
    const moving = makeRoom('moving', {
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, otherFloorNeighbor])

    expect(result.guides).toEqual([])
  })

  it('returns the room position unchanged with no guides when there are no neighbors', () => {
    const moving = makeRoom('moving', { position: { x: 1.234, y: 0, z: 5.678 } })
    const result = snapToNeighbors(moving, [moving])

    expect(result.x).toBe(1.234)
    expect(result.z).toBe(5.678)
    expect(result.guides).toEqual([])
  })

  it('can snap both axes at once', () => {
    const cornerNeighbor = makeRoom('corner', {
      position: { x: 10, y: 0, z: 10 },
      dimensions: { width: 4, height: 2, depth: 4 },
    })
    const moving = makeRoom('moving', {
      position: { x: 6.7, y: 0, z: 6.7 },
      dimensions: { width: 2, height: 2, depth: 2 },
    })

    const result = snapToNeighbors(moving, [moving, cornerNeighbor])

    expect(result.x).toBe(7)
    expect(result.z).toBe(7)
    expect(result.guides).toHaveLength(2)
  })
})

describe('mergeBoxes', () => {
  it('produces the union bounding box of two side-by-side rooms', () => {
    // a spans x:[-2,2] z:[-3,3]; b spans x:[2,6] z:[-3,3] -> union x:[-2,6] z:[-3,3]
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const b = makeRoom('b', { position: { x: 4, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })

    const merged = mergeBoxes(a, b)

    expect(merged.position).toEqual({ x: 2, y: 0, z: 0 })
    expect(merged.dimensions).toEqual({ width: 8, height: 3, depth: 6 })
  })

  it('produces the union bounding box of two rooms with different heights', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 2, height: 2, depth: 2 } })
    const b = makeRoom('b', { position: { x: 2, y: 1, z: 0 }, dimensions: { width: 2, height: 4, depth: 2 } })
    // a's height spans y:[-1,1]; b's spans y:[-1,3] -> union y:[-1,3], height 4, center y=1

    const merged = mergeBoxes(a, b)

    expect(merged.position.y).toBe(1)
    expect(merged.dimensions.height).toBe(4)
  })
})

describe('boxesAreAdjacent', () => {
  it('flags two rooms sharing a wall (touching edge, overlapping the other axis)', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const b = makeRoom('b', { position: { x: 4, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    expect(boxesAreAdjacent(a, b)).toBe(true)
  })

  it('does not flag two rooms with a real gap between them', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const b = makeRoom('b', { position: { x: 10, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    expect(boxesAreAdjacent(a, b)).toBe(false)
  })

  it('does not flag rooms that only touch at a corner (no shared wall)', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 4 } })
    const b = makeRoom('b', { position: { x: 4, y: 0, z: 4 }, dimensions: { width: 4, height: 3, depth: 4 } })
    expect(boxesAreAdjacent(a, b)).toBe(false)
  })

  it('does not flag rooms on different floors', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const b = makeRoom('b', { position: { x: 4, y: 5, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    expect(boxesAreAdjacent(a, b)).toBe(false)
  })

  it('flags two overlapping rooms as adjacent too', () => {
    const a = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const b = makeRoom('b', { position: { x: 1, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    expect(boxesAreAdjacent(a, b)).toBe(true)
  })
})

describe('findFreeSpot', () => {
  const dims = { width: 2, height: 2, depth: 2 }

  it('returns the origin when the floor is empty', () => {
    expect(findFreeSpot([], 0, dims, 2)).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('skips a room occupying the origin and returns the next free grid slot', () => {
    const occupying = makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: dims })
    expect(findFreeSpot([occupying], 0, dims, 2)).toEqual({ x: 2, y: 0, z: 0 })
  })

  it('ignores rooms on a different floor', () => {
    const otherFloor = makeRoom('a', { position: { x: 0, y: 9, z: 0 }, dimensions: dims })
    expect(findFreeSpot([otherFloor], 0, dims, 2)).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('keeps searching past multiple occupied slots', () => {
    const rooms = [
      makeRoom('a', { position: { x: 0, y: 0, z: 0 }, dimensions: dims }),
      makeRoom('b', { position: { x: 2, y: 0, z: 0 }, dimensions: dims }),
    ]
    expect(findFreeSpot(rooms, 0, dims, 2)).toEqual({ x: 4, y: 0, z: 0 })
  })
})
