import { describe, expect, it } from 'vitest'
import type { Room } from '@/types/digital-twin/building.ts'
import { SNAP_GAP, hiddenWalls, snapRooms } from './snapRooms.ts'

// `floor` is the storey level; a room position is its centre, so the helper lifts it.
const room = (id: string, x: number, z: number, width: number, depth: number, floor = 0): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x, y: floor + 1.5, z },
  dimensions: { width, height: 3, depth },
})

const walls = (r: Room) => ({
  minX: r.position.x - r.dimensions.width / 2,
  maxX: r.position.x + r.dimensions.width / 2,
  minZ: r.position.z - r.dimensions.depth / 2,
  maxZ: r.position.z + r.dimensions.depth / 2,
})

describe('rooms drawn flush with their near neighbours', () => {
  it('meet in the middle of a small gap and keep every other wall', () => {
    const [a, b] = snapRooms([room('a', 0, 0, 4, 4), room('b', 4.3, 0, 4, 4)]).map(walls)

    expect(a).toEqual({ minX: -2, maxX: expect.closeTo(2.15), minZ: -2, maxZ: 2 })
    expect(b).toEqual({ minX: expect.closeTo(2.15), maxX: 6.3, minZ: -2, maxZ: 2 })
  })

  it('close gaps along z too', () => {
    const [a, b] = snapRooms([room('a', 0, 0, 4, 4), room('b', 0, 4.4, 4, 4)]).map(walls)

    expect(a!.maxZ).toBeCloseTo(2.2)
    expect(b!.minZ).toBeCloseTo(2.2)
  })

  it('leave rooms further apart than a wall where they are', () => {
    const rooms = [room('a', 0, 0, 4, 4), room('b', 4 + SNAP_GAP + 0.1, 0, 4, 4)]
    expect(snapRooms(rooms)).toEqual(rooms)
  })

  it('leave rooms that already touch, meet only at a corner, or sit on another storey', () => {
    const rooms = [
      room('a', 0, 0, 4, 4),
      room('touching', 4, 0, 4, 4),
      room('corner', -4.2, 4.2, 4, 4),
      room('upstairs', 0, 4.2, 4, 4, 3.2),
    ]
    expect(snapRooms(rooms)).toEqual(rooms)
  })

  it('move a wall only half the smallest gap, so neighbours never overlap', () => {
    const [a, b, c] = snapRooms([
      room('a', 0, 0, 4, 4),
      room('b', 4.2, -1, 4, 2),
      room('c', 4.4, 1, 4, 2),
    ]).map(walls)

    expect(a!.maxX).toBeCloseTo(2.1)
    expect(b!.minX).toBeCloseTo(2.1)
    expect(c!.minX).toBeGreaterThanOrEqual(a!.maxX)
  })

  it('moves only the small wall when it faces part of a long one, so the corridor past the long wall keeps its width', () => {
    const [long, small] = snapRooms([room('long', 0, 0, 4, 8), room('small', 3.3, 0, 2, 2)]).map(
      walls,
    )

    expect(long!.maxX).toBe(2)
    expect(small!.minX).toBeCloseTo(2)
    expect(small!.maxX).toBeCloseTo(4.3)
  })

  it('leaves offset rooms whose walls each face open space too', () => {
    const rooms = [room('a', 0, 0, 4, 4), room('b', 4.3, 3, 4, 4)]
    expect(snapRooms(rooms)).toEqual(rooms)
  })

  it('never adds an overlap, even when walls face by exactly the minimum', () => {
    // Ground floor of the dev building around a pair that once overlapped; 029 and 041 already do.
    const rooms = [
      room('G-Room-027', 22.4, 6.65, 8.5, 5.9),
      room('G-Room-028', 15.85, 4.65, 4, 1.9),
      room('G-Room-029', 27.9, 2.6, 1.7, 1.8),
      room('G-Room-030', 20.3, 2.55, 12.9, 1.7),
      room('G-Room-032', 20.25, -4.65, 12.6, 12.1),
      room('G-Room-040', 24.4, -16.4, 4.3, 1),
      room('G-Room-041', 32.2, -10.25, 10.5, 24.9),
      room('G-Room-043', 16, -21.8, 21.3, 9.4),
      room('G-WC-008', 24.4, -11.85, 4.3, 1.7),
      room('G-WC-011', 24.35, -14.9, 4.2, 1.6),
    ]
    const overlapping = (list: Room[]) =>
      list.flatMap((a, i) =>
        list
          .slice(i + 1)
          .filter((b) => {
            const [p, q] = [walls(a), walls(b)]
            return (
              Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX) > 1e-9 &&
              Math.min(p.maxZ, q.maxZ) - Math.max(p.minZ, q.minZ) > 1e-9
            )
          })
          .map((b) => `${a.id}|${b.id}`),
      )

    expect(overlapping(snapRooms(rooms))).toEqual(overlapping(rooms))
  })

  it('does not change the rooms it is given', () => {
    const rooms = [room('a', 0, 0, 4, 4), room('b', 4.3, 0, 4, 4)]
    snapRooms(rooms)
    expect(rooms[0]!.dimensions.width).toBe(4)
  })
})

describe('walls whose edges a touching neighbour already draws', () => {
  const NONE = [0, 0, 0, 0]

  it('hide on one side only when two equal walls touch', () => {
    expect(hiddenWalls([room('a', 0, 0, 4, 4), room('b', 4, 0, 4, 4)])).toEqual({
      a: NONE,
      b: [1, 0, 0, 0],
    })
    expect(hiddenWalls([room('a', 0, 0, 4, 4), room('b', 0, 4, 4, 4)])).toEqual({
      a: NONE,
      b: [0, 0, 1, 0],
    })
  })

  it('hide the long wall that several neighbours cover together', () => {
    expect(
      hiddenWalls([room('long', 4, 0, 4, 4), room('b', 0, -1, 4, 2), room('c', 0, 1, 4, 2)]),
    ).toEqual({ long: [1, 0, 0, 0], b: NONE, c: [0, 0, 1, 0] })
  })

  it('hide the short wall a long neighbour covers', () => {
    expect(hiddenWalls([room('long', 0, 0, 4, 4), room('short', 4, 0, 4, 2)])).toEqual({
      long: NONE,
      short: [1, 0, 0, 0],
    })
  })

  it('keep both walls where neither covers the other', () => {
    expect(hiddenWalls([room('a', 0, 0, 4, 4), room('b', 4, 2, 4, 4)])).toEqual({
      a: NONE,
      b: NONE,
    })
  })

  it('keep walls with a gap, a shared corner only, or on another storey', () => {
    expect(
      hiddenWalls([
        room('a', 0, 0, 4, 4),
        room('gap', 4.2, 0, 4, 4),
        room('corner', -4, 4, 4, 4),
        room('upstairs', 0, 4, 4, 4, 3.2),
      ]),
    ).toEqual({ a: NONE, gap: NONE, corner: NONE, upstairs: NONE })
  })
})
