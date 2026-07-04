import { computed, type ComputedRef } from 'vue'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Room } from '@/models/building.ts'

export interface RoomPartition {
  instanced: Room[]
  overlay: Room | null
}

/**
 * Splits rooms into the bulk InstancedMesh batch and the (at most one) room
 * rendered individually. The exploded room stays hidden regardless of
 * selection (it renders only as an edge outline elsewhere), so exclusion
 * takes precedence over the selected-room overlay.
 */
export function partitionRooms(
  rooms: Room[],
  selectedRoomId: string | null,
  explodedRoomId: string | null,
): RoomPartition {
  const instanced: Room[] = []
  let overlay: Room | null = null

  for (const room of rooms) {
    if (room.id === explodedRoomId) continue
    if (room.id === selectedRoomId) {
      overlay = room
      continue
    }
    instanced.push(room)
  }

  return { instanced, overlay }
}

const IDENTITY_ROTATION = new Quaternion()

/** A room's box geometry is a unit cube instanced via translation + non-uniform scale. */
export function buildRoomMatrix(room: Room): Matrix4 {
  return new Matrix4().compose(
    new Vector3(room.position.x, room.position.y, room.position.z),
    IDENTITY_ROTATION,
    new Vector3(room.dimensions.width, room.dimensions.height, room.dimensions.depth),
  )
}

export function useInstancedRooms(
  visibleRooms: ComputedRef<Room[]>,
  selectedRoomId: ComputedRef<string | null>,
  explodedRoomId: ComputedRef<string | null>,
) {
  const partition = computed<RoomPartition>(() =>
    partitionRooms(visibleRooms.value, selectedRoomId.value, explodedRoomId.value),
  )

  const instancedRooms = computed(() => partition.value.instanced)
  const overlayRoom = computed(() => partition.value.overlay)
  const roomIdByInstanceIndex = computed(() => instancedRooms.value.map((room) => room.id))

  return { instancedRooms, overlayRoom, roomIdByInstanceIndex }
}
