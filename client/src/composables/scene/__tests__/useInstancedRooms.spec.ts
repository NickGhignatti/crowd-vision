import { describe, it, expect } from 'vitest'
import { Vector3, Quaternion } from 'three'
import { partitionRooms, buildRoomMatrix } from '../useInstancedRooms'
import type { Room } from '@/models/building.ts'

const makeRoom = (id: string): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 1, y: 2, z: 3 },
  dimensions: { width: 4, height: 5, depth: 6 },
})

describe('partitionRooms', () => {
  it('puts every room in the instanced batch when nothing is selected or exploded', () => {
    const rooms = [makeRoom('a'), makeRoom('b'), makeRoom('c')]
    const result = partitionRooms(rooms, null, null)
    expect(result.instanced).toEqual(rooms)
    expect(result.overlay).toBeNull()
  })

  it('pulls the selected room out into the overlay, preserving order of the rest', () => {
    const rooms = [makeRoom('a'), makeRoom('b'), makeRoom('c')]
    const result = partitionRooms(rooms, 'b', null)
    expect(result.instanced.map((r) => r.id)).toEqual(['a', 'c'])
    expect(result.overlay?.id).toBe('b')
  })

  it('excludes the exploded room from the instanced batch entirely', () => {
    const rooms = [makeRoom('a'), makeRoom('b'), makeRoom('c')]
    const result = partitionRooms(rooms, null, 'b')
    expect(result.instanced.map((r) => r.id)).toEqual(['a', 'c'])
    expect(result.overlay).toBeNull()
  })

  it('excludes a room that is both selected and exploded, matching the pre-instancing hidden-regardless-of-selection behavior', () => {
    const rooms = [makeRoom('a'), makeRoom('b'), makeRoom('c')]
    const result = partitionRooms(rooms, 'b', 'b')
    expect(result.instanced.map((r) => r.id)).toEqual(['a', 'c'])
    expect(result.overlay).toBeNull()
  })

  it('returns an empty instanced batch and no overlay for an empty room list', () => {
    const result = partitionRooms([], 'anything', 'anything')
    expect(result.instanced).toEqual([])
    expect(result.overlay).toBeNull()
  })
})

describe('buildRoomMatrix', () => {
  it('encodes the room position as translation and dimensions as scale, with no rotation', () => {
    const room = makeRoom('a')
    const matrix = buildRoomMatrix(room)

    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    matrix.decompose(position, quaternion, scale)

    expect(position.toArray()).toEqual([1, 2, 3])
    expect(scale.toArray()).toEqual([4, 5, 6])
    expect(quaternion.equals(new Quaternion())).toBe(true)
  })
})
