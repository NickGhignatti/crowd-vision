import { computed, type ComputedRef } from 'vue'
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
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
const scratchPosition = new Vector3()
const scratchScale = new Vector3()

/**
 * A room's box geometry is a unit cube instanced via translation + non-uniform scale.
 * Writes into `target` (default a fresh Matrix4) so hot paths can reuse one instance
 * instead of allocating per room per tick.
 */
export function buildRoomMatrix(room: Room, target: Matrix4 = new Matrix4()): Matrix4 {
  return target.compose(
    scratchPosition.set(room.position.x, room.position.y, room.position.z),
    IDENTITY_ROTATION,
    scratchScale.set(room.dimensions.width, room.dimensions.height, room.dimensions.depth),
  )
}

/** Rewrites every instance's transform; positions/sizes are static per floor, so this only needs to run when the room set changes, not on every telemetry tick. */
export function applyRoomMatrices(mesh: InstancedMesh, rooms: Room[], scratchMatrix: Matrix4): void {
  rooms.forEach((room, index) => {
    mesh.setMatrixAt(index, buildRoomMatrix(room, scratchMatrix))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** Rewrites only the per-instance colour buffer — the cheap path for a telemetry tick. */
export function applyRoomColors(
  mesh: InstancedMesh,
  rooms: Room[],
  colors: Record<string, string>,
  scratchColor: Color,
  fallback: string,
): void {
  rooms.forEach((room, index) => {
    scratchColor.set(colors[room.id] ?? fallback)
    mesh.setColorAt(index, scratchColor)
  })
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
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
