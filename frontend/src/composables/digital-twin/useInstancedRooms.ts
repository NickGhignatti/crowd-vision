import { computed, type Ref } from 'vue'
import { Color, Matrix4, type InstancedMesh } from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { buildRoomMatrix, partitionRooms } from '@/utils/digital-twin/roomPartition.ts'
import type { RoomPartition } from '@/utils/digital-twin/roomPartition.ts'

const NONE = new Set<string>()

/** Rewrites every instance's transform; positions/sizes are static per floor, so this only needs to run when the room set changes, not on every telemetry tick. */
export function applyRoomMatrices(
  mesh: InstancedMesh,
  rooms: Room[],
  scratchMatrix: Matrix4,
  hidden: Set<string> = NONE,
): void {
  rooms.forEach((room, index) => {
    mesh.setMatrixAt(index, buildRoomMatrix(room, scratchMatrix, hidden.has(room.id)))
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
  visibleRooms: Ref<Room[]>,
  selectedRoomId: Ref<string | null>,
  explodedRoomId: Ref<string | null>,
) {
  const partition = computed<RoomPartition>(() =>
    partitionRooms(visibleRooms.value, selectedRoomId.value, explodedRoomId.value),
  )

  const instancedRooms = computed(() => partition.value.instanced)
  const hiddenRooms = computed(() => partition.value.hidden)
  const overlayRoom = computed(() => partition.value.overlay)
  const roomIdByInstanceIndex = computed(() => instancedRooms.value.map((room) => room.id))

  return { instancedRooms, hiddenRooms, overlayRoom, roomIdByInstanceIndex }
}
