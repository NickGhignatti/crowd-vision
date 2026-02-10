import type { BuildingPayload } from '@/models/building'

import { ref } from 'vue'
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js'

export function useSceneControls() {
  const cameraRef = ref<PerspectiveCamera | null>(null)
  const controlsRef = ref<{ value: OrbitControlsType } | null>(null)
  const isRotating = ref(false)

  const resetView = () => {
    if (cameraRef.value) {
      cameraRef.value.position.set(10, 10, 10)
    }
  }

  const zoom = (direction: 1 | -1) => {
    if (!cameraRef.value) return
    const dirVector = new Vector3()
    cameraRef.value.getWorldDirection(dirVector)
    cameraRef.value.position.addScaledVector(dirVector, direction * 2)
  }

  const togglePanorama = () => {
    isRotating.value = !isRotating.value
  }

  const triggerExplodeView = (
    roomId: string | null,
    building: BuildingPayload | null,
    isExplodedState: boolean,
  ) => {
    if (!roomId || !building) return { exploded: false, roomId: null }

    if (isExplodedState) {
      resetView()
      return { exploded: false, roomId: null }
    }

    const room = building.rooms.find((r) => r.id === roomId)
    if (!room || !cameraRef.value) return { exploded: isExplodedState, roomId: null }

    const roomCenter = new Vector3(
      room.position.x,
      room.position.y + room.dimensions.height / 2,
      room.position.z,
    )

    const offset = new Vector3(10, 10, 15)
    const newPosition = roomCenter.clone().add(offset)
    cameraRef.value.position.copy(newPosition)

    return { exploded: true, roomId: roomId }
  }

  return {
    cameraRef,
    controlsRef,
    isRotating,
    resetView,
    zoomIn: () => zoom(1),
    zoomOut: () => zoom(-1),
    togglePanorama,
    triggerExplodeView,
  }
}
