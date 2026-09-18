import type { Room } from '@/types/digital-twin/building.ts'

/** Widest gap between facing walls still drawn as touching, about a wall's thickness. */
export const SNAP_GAP = 0.75
// Walls sharing less than this reach each other only at a corner.
const MIN_FACING = 0.5
const EPSILON = 1e-6

type Span = [number, number]

interface Box {
  x: Span
  y: Span
  z: Span
}

// A room position is the box centre on every axis.
const boxOf = ({ position: p, dimensions: d }: Room): Box => ({
  x: [p.x - d.width / 2, p.x + d.width / 2],
  y: [p.y - d.height / 2, p.y + d.height / 2],
  z: [p.z - d.depth / 2, p.z + d.depth / 2],
})

const overlap = ([aLo, aHi]: Span, [bLo, bHi]: Span) => Math.min(aHi, bHi) - Math.max(aLo, bLo)

type Axis = 'x' | 'z'
const OTHER: Record<Axis, Axis> = { x: 'z', z: 'x' }
// Room edges in the data sit on a 0.1 grid; less than half a step still counts as covered.
const COVER_TOLERANCE = 0.05

/** One wall: the room, the axis it faces along, and 0 for its low side or 1 for its high side. */
type WallKey = `${number}:${Axis}:${0 | 1}`
const WALLS = ['x:0', 'x:1', 'z:0', 'z:1'] as const
interface Facing {
  other: WallKey
  gap: number
  span: Span
}
interface WallPair {
  low: WallKey
  high: WallKey
  gap: number
  span: Span
}

// True when the spans, clipped to `wall`, leave no uncovered stretch of it.
function covers(wall: Span, spans: Span[]): boolean {
  let reached = wall[0]
  for (const [lo, hi] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (lo > reached + COVER_TOLERANCE) return false
    reached = Math.max(reached, hi)
  }
  return reached >= wall[1] - COVER_TOLERANCE
}

/** Every pair of walls that face at all, however little, with the stretch they share. */
function wallPairs(boxes: Box[]): WallPair[] {
  const pairs: WallPair[] = []
  boxes.forEach((a, i) => {
    boxes.forEach((b, j) => {
      if (j <= i || overlap(a.y, b.y) < MIN_FACING) return
      for (const axis of ['x', 'z'] as const) {
        const across = OTHER[axis]
        const span: Span = [
          Math.max(a[across][0], b[across][0]),
          Math.min(a[across][1], b[across][1]),
        ]
        if (span[1] - span[0] <= EPSILON) continue
        const [low, high] = a[axis][1] <= b[axis][0] + EPSILON ? [i, j] : [j, i]
        const gap = boxes[high]![axis][0] - boxes[low]![axis][1]
        if (gap < -EPSILON) continue
        pairs.push({
          low: `${low}:${axis}:1`,
          high: `${high}:${axis}:0`,
          gap: Math.max(gap, 0),
          span,
        })
      }
    })
  })
  return pairs
}

// Each wall's facings among `pairs`, recorded from both sides.
function facingsOf(pairs: WallPair[]): Map<WallKey, Facing[]> {
  const facings = new Map<WallKey, Facing[]>()
  for (const { low, high, gap, span } of pairs) {
    facings.set(low, [...(facings.get(low) ?? []), { other: high, gap, span }])
    facings.set(high, [...(facings.get(high) ?? []), { other: low, gap, span }])
  }
  return facings
}

function wallCovered(boxes: Box[], key: WallKey, facings: Facing[]): boolean {
  const [room, axis] = key.split(':') as [string, Axis]
  return covers(
    boxes[Number(room)]![OTHER[axis]],
    facings.map((facing) => facing.span),
  )
}

/**
 * Rooms stretched to close gaps up to `SNAP_GAP` between facing walls. A wall moves only when
 * neighbours cover all of it; a wall that also faces open space stays, so corridors keep their width.
 */
export function snapRooms(rooms: Room[]): Room[] {
  const boxes = rooms.map(boxOf)
  // Every facing pair, however little: the last pass keeps them apart.
  const blockers = wallPairs(boxes)
  const facings = facingsOf(
    blockers.filter(
      ({ gap, span }) =>
        span[1] - span[0] >= MIN_FACING - EPSILON && gap > EPSILON && gap <= SNAP_GAP,
    ),
  )

  const isCovered = (key: WallKey) => wallCovered(boxes, key, facings.get(key) ?? [])

  // A covered wall meets a covered neighbour halfway, and an uncovered one all the way.
  const moveOf = (key: WallKey) =>
    isCovered(key)
      ? Math.min(...facings.get(key)!.map(({ other, gap }) => (isCovered(other) ? gap / 2 : gap)))
      : 0

  const moves = new Map<WallKey, number>()
  for (const key of facings.keys()) moves.set(key, moveOf(key))
  for (const { low, high, gap } of blockers) {
    const [a, b] = [moves.get(low) ?? 0, moves.get(high) ?? 0]
    if (a + b <= gap + EPSILON) continue
    if (a) moves.set(low, Math.min(a, gap / 2))
    if (b) moves.set(high, Math.min(b, gap / 2))
  }

  return rooms.map((room, i) => {
    const [left, right, back, front] = WALLS.map(
      (wall) => moves.get(`${i}:${wall}` as WallKey) ?? 0,
    ) as [number, number, number, number]
    if (left + right + back + front === 0) return room
    return {
      ...room,
      position: {
        ...room.position,
        x: room.position.x + (right - left) / 2,
        z: room.position.z + (front - back) / 2,
      },
      dimensions: {
        ...room.dimensions,
        width: room.dimensions.width + left + right,
        depth: room.dimensions.depth + back + front,
      },
    }
  })
}

type Flags = [number, number, number, number]

/**
 * Edges another room also draws: `walls` (-x, +x, -z, +z) their top and bottom edges, `corners`
 * (-x-z, +x-z, -x+z, +x+z) their vertical one, 1/2/3 as the keeper shares an x face, z face, both.
 */
export interface HiddenEdges {
  walls: Flags
  corners: Flags
}

const same = (a: number, b: number) => Math.abs(a - b) <= COVER_TOLERANCE
const roomOf = (key: WallKey) => Number(key.split(':')[0])
const CORNERS = [0, 1, 2, 3] as const
// Corner k sits on the x side `k & 1` and the z side `k >> 1`, in `HiddenEdges` order.
const corner = (box: Box, k: number): [number, number] => [box.x[k & 1]!, box.z[k >> 1]!]

/** Each room's edges, by id, that a neighbour already draws, so every line is drawn once. */
export function hiddenEdges(rooms: Room[]): Record<string, HiddenEdges> {
  const boxes = rooms.map(boxOf)
  // Only a neighbour of the same height has its top and bottom edges on this wall's.
  const touching = facingsOf(
    wallPairs(boxes).filter(({ low, high, gap, span }) => {
      const [a, b] = [boxes[roomOf(low)]!.y, boxes[roomOf(high)]!.y]
      return (
        gap <= EPSILON &&
        span[1] - span[0] >= MIN_FACING - EPSILON &&
        same(a[0], b[0]) &&
        same(a[1], b[1])
      )
    }),
  )

  const isCovered = (key: WallKey) => wallCovered(boxes, key, touching.get(key) ?? [])
  // Of two walls covering each other, the one facing -x or -z hides: the edge still draws once.
  const hidesWall = (key: WallKey) =>
    isCovered(key) &&
    (key.endsWith(':0') || !touching.get(key)!.some(({ other }) => isCovered(other)))

  // Another room's vertical edge in the same place, at least as tall; the first of equals keeps it.
  // Only a keeper with a face on the same side can take the line over, so a diagonal one never does.
  const cornerFlag = (i: number, k: number) => {
    const [x, z] = corner(boxes[i]!, k)
    const [bottom, top] = boxes[i]!.y
    let flag = 0
    boxes.forEach((other, j) => {
      if (j === i || other.y[0] > bottom + COVER_TOLERANCE || other.y[1] < top - COVER_TOLERANCE)
        return
      if (same(other.y[0], bottom) && same(other.y[1], top) && j > i) return
      for (const c of CORNERS) {
        const [cx, cz] = corner(other, c)
        if (!same(cx, x) || !same(cz, z)) continue
        if ((c & 1) === (k & 1)) flag |= 1
        if (c >> 1 === k >> 1) flag |= 2
      }
    })
    return flag
  }

  return Object.fromEntries(
    rooms.map((room, i) => [
      room.id,
      {
        walls: WALLS.map((wall) => (hidesWall(`${i}:${wall}` as WallKey) ? 1 : 0)) as Flags,
        corners: CORNERS.map((k) => cornerFlag(i, k)) as Flags,
      },
    ]),
  )
}
