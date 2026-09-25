import { Matrix4, Quaternion, Vector3 } from 'three'

import type { Room } from '@/types/digital-twin/building.ts'

export interface RoomPartition {
  /** Every room on screen, in a fixed order: a batch whose size changed would remount. */
  instanced: Room[]
  /** Rooms the batch collapses to nothing: the selected one (drawn as the overlay) and the exploded one. */
  hidden: Set<string>
  overlay: Room | null
}

/**
 * Splits rooms into the instanced batch and the (at most one) room drawn on its own. Selection
 * hides a room inside the batch rather than removing it, so clicking around never changes the
 * batch's size. The exploded room is only an outline elsewhere, so it wins over the overlay.
 */
export function partitionRooms(
  rooms: Room[],
  selectedRoomId: string | null,
  explodedRoomId: string | null,
): RoomPartition {
  const hidden = new Set<string>()
  if (explodedRoomId && rooms.some((room) => room.id === explodedRoomId)) hidden.add(explodedRoomId)

  const selected = rooms.find((room) => room.id === selectedRoomId) ?? null
  if (selected) hidden.add(selected.id)

  return {
    instanced: rooms,
    hidden,
    overlay: selected && selected.id !== explodedRoomId ? selected : null,
  }
}

const IDENTITY_ROTATION = new Quaternion()
const scratchPosition = new Vector3()
const scratchScale = new Vector3()

/**
 * A room's box is a unit cube instanced by translation and non-uniform scale; a hidden room gets
 * a scale of zero, which draws nothing and cannot be hit by a raycast. Writes into `target` so a
 * hot path can reuse one matrix.
 */
export function buildRoomMatrix(
  room: Room,
  target: Matrix4 = new Matrix4(),
  hidden = false,
): Matrix4 {
  return target.compose(
    scratchPosition.set(room.position.x, room.position.y, room.position.z),
    IDENTITY_ROTATION,
    hidden
      ? scratchScale.set(0, 0, 0)
      : scratchScale.set(room.dimensions.width, room.dimensions.height, room.dimensions.depth),
  )
}
