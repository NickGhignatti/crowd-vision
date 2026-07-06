import { describe, it, expect, vi } from 'vitest'
import { Vector3, Quaternion, Matrix4, Color, type InstancedMesh } from 'three'
import {
  partitionRooms,
  buildRoomMatrix,
  applyRoomMatrices,
  applyRoomColors,
} from '../useInstancedRooms'
import type { Room } from '@/models/building.ts'

const makeRoom = (id: string, overrides: Partial<Room> = {}): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 1, y: 2, z: 3 },
  dimensions: { width: 4, height: 5, depth: 6 },
  ...overrides,
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

  it('writes into and returns the given target instance instead of allocating a new one', () => {
    const target = new Matrix4()
    const result = buildRoomMatrix(makeRoom('a'), target)
    expect(result).toBe(target)
  })

  it('does not leak state between successive calls that reuse the same target', () => {
    const target = new Matrix4()
    buildRoomMatrix(makeRoom('a', { position: { x: 1, y: 1, z: 1 }, dimensions: { width: 1, height: 1, depth: 1 } }), target)
    buildRoomMatrix(makeRoom('b', { position: { x: 9, y: 8, z: 7 }, dimensions: { width: 2, height: 3, depth: 4 } }), target)

    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    target.decompose(position, quaternion, scale)

    expect(position.toArray()).toEqual([9, 8, 7])
    expect(scale.toArray()).toEqual([2, 3, 4])
  })
})

describe('applyRoomMatrices', () => {
  const makeFakeMesh = () => ({
    setMatrixAt: vi.fn(),
    computeBoundingSphere: vi.fn(),
    instanceMatrix: { needsUpdate: false },
  })

  it('writes one matrix per room and flags the instance matrix + bounding sphere exactly once', () => {
    const rooms = [makeRoom('a'), makeRoom('b')]
    const mesh = makeFakeMesh()
    const scratch = new Matrix4()

    applyRoomMatrices(mesh as unknown as InstancedMesh, rooms, scratch)

    expect(mesh.setMatrixAt).toHaveBeenCalledTimes(2)
    expect(mesh.setMatrixAt).toHaveBeenNthCalledWith(1, 0, scratch)
    expect(mesh.setMatrixAt).toHaveBeenNthCalledWith(2, 1, scratch)
    expect(mesh.instanceMatrix.needsUpdate).toBe(true)
    expect(mesh.computeBoundingSphere).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there are no rooms, but still flags the buffers once', () => {
    const mesh = makeFakeMesh()
    applyRoomMatrices(mesh as unknown as InstancedMesh, [], new Matrix4())

    expect(mesh.setMatrixAt).not.toHaveBeenCalled()
    expect(mesh.computeBoundingSphere).toHaveBeenCalledTimes(1)
  })
})

describe('applyRoomColors', () => {
  const makeFakeMesh = (withInstanceColor = true) => ({
    setColorAt: vi.fn(),
    instanceColor: withInstanceColor ? { needsUpdate: false } : null,
  })

  it('sets a colour per room from the map and marks instanceColor dirty when it exists', () => {
    const rooms = [makeRoom('a'), makeRoom('b')]
    const colors = { a: '#111111', b: '#222222' }
    const mesh = makeFakeMesh()
    const scratch = new Color()

    applyRoomColors(mesh as unknown as InstancedMesh, rooms, colors, scratch, '#fallback')

    expect(mesh.setColorAt).toHaveBeenCalledTimes(2)
    expect(mesh.instanceColor!.needsUpdate).toBe(true)
  })

  it('falls back to the given colour when a room id is missing from the map', () => {
    const rooms = [makeRoom('a')]
    const mesh = makeFakeMesh()
    const scratch = new Color()
    const setSpy = vi.spyOn(scratch, 'set')

    applyRoomColors(mesh as unknown as InstancedMesh, rooms, {}, scratch, '#fallback')

    expect(setSpy).toHaveBeenCalledWith('#fallback')
  })

  it('does not throw and skips the needsUpdate flag when instanceColor is null', () => {
    const rooms = [makeRoom('a')]
    const mesh = makeFakeMesh(false)
    const scratch = new Color()

    expect(() =>
      applyRoomColors(mesh as unknown as InstancedMesh, rooms, {}, scratch, '#fallback'),
    ).not.toThrow()
    expect(mesh.instanceColor).toBeNull()
  })
})
