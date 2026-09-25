import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { buildRoomMatrix, partitionRooms } from './roomPartition.ts'
import type { Room } from '@/types/digital-twin/building.ts'

const room = (id: string): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 1, y: 2, z: 3 },
  dimensions: { width: 4, height: 5, depth: 6 },
})
const rooms = [room('a'), room('b'), room('c')]
const ids = (list: Room[]) => list.map((r) => r.id)

describe('partitionRooms', () => {
  it('keeps every visible room in the batch, in order, whatever is selected', () => {
    // A batch whose size changes with selection remounts the mesh and recompiles its shader.
    for (const selected of [null, 'b']) {
      expect(ids(partitionRooms(rooms, selected, null).instanced)).toEqual(['a', 'b', 'c'])
    }
  })

  it('hides the selected room in the batch and draws it as the overlay', () => {
    const partition = partitionRooms(rooms, 'b', null)
    expect([...partition.hidden]).toEqual(['b'])
    expect(partition.overlay?.id).toBe('b')
  })

  it('hides the exploded room with no overlay, even when it is also selected', () => {
    const partition = partitionRooms(rooms, 'b', 'b')
    expect([...partition.hidden]).toEqual(['b'])
    expect(partition.overlay).toBeNull()
  })

  it('hides both when one room is selected and another exploded', () => {
    const partition = partitionRooms(rooms, 'a', 'c')
    expect([...partition.hidden].sort()).toEqual(['a', 'c'])
    expect(partition.overlay?.id).toBe('a')
  })

  it('hides nothing for a selection that is not on screen', () => {
    const partition = partitionRooms(rooms, 'elsewhere', null)
    expect(partition.hidden.size).toBe(0)
    expect(partition.overlay).toBeNull()
  })
})

describe('buildRoomMatrix', () => {
  const scaleOf = (matrix: Matrix4) => {
    const scale = new Vector3()
    matrix.decompose(new Vector3(), new Quaternion(), scale)
    return scale
  }

  it('places and sizes a room as a unit cube', () => {
    expect(scaleOf(buildRoomMatrix(room('a'))).toArray()).toEqual([4, 5, 6])
  })

  it('collapses a hidden room to nothing, so it is neither drawn nor clickable', () => {
    // decompose() reports scale 1 for a singular matrix, so read the axes' lengths directly.
    expect(buildRoomMatrix(room('a'), new Matrix4(), true).getMaxScaleOnAxis()).toBe(0)
  })
})
