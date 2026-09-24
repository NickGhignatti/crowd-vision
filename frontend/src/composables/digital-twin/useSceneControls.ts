import type { Building, Room } from '@/types/digital-twin/building.ts'
import { easeInOut, interpolateView, topView } from '@/utils/digital-twin/camera.ts'
import type { CameraView } from '@/utils/digital-twin/camera.ts'

import { onBeforeUnmount, ref } from 'vue'
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js'

/** `requestFrame` asks the on-demand scene for a frame; each camera move calls it every tick. */
export function useSceneControls(requestFrame: () => void = () => {}) {
  const cameraRef = ref<PerspectiveCamera | null>(null)
  const controlsRef = ref<{ instance: OrbitControlsType | null } | null>(null)
  const isRotating = ref(false)

  // Long enough to read as movement, short enough not to make a click feel slow.
  const TWEEN_MS = 400
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  let tween = 0

  const cancelTween = () => {
    cancelAnimationFrame(tween)
    tween = 0
  }

  const currentView = (): CameraView | null => {
    const camera = cameraRef.value
    if (!camera) return null
    const target = controlsRef.value?.instance?.target
    const { x, y, z } = camera.position
    return {
      position: { x, y, z },
      target: target ? { x: target.x, y: target.y, z: target.z } : { x: 0, y: 0, z: 0 },
    }
  }

  const applyView = (view: CameraView) => {
    const camera = cameraRef.value
    if (!camera) return
    camera.position.set(view.position.x, view.position.y, view.position.z)
    const controls = controlsRef.value?.instance
    if (controls) {
      controls.target.set(view.target.x, view.target.y, view.target.z)
      controls.update()
    } else {
      camera.lookAt(view.target.x, view.target.y, view.target.z)
    }
  }

  /**
   * Glides the camera and its target to `to`, asking for a frame each tick since the scene only
   * renders on demand. A new move or grabbing the orbit controls cancels it; reduced motion jumps.
   */
  const animateTo = (to: CameraView, requestFrame: () => void) => {
    const from = currentView()
    if (!from) return
    cancelTween()
    if (reducedMotion) {
      applyView(to)
      requestFrame()
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / TWEEN_MS, 1)
      applyView(interpolateView(from, to, easeInOut(t)))
      requestFrame()
      tween = t < 1 ? requestAnimationFrame(tick) : 0
    }
    tween = requestAnimationFrame(tick)
  }

  onBeforeUnmount(cancelTween)

  const glide = (view: CameraView | null) => {
    if (view) animateTo(view, requestFrame)
  }

  /** The starting view, target included: after a top view, keeping that target looked off. */
  const resetView = () => glide({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } })

  // Relative to where the camera is now, so a click mid-glide continues from there.
  const zoom = (direction: 1 | -1) => {
    const camera = cameraRef.value
    const from = currentView()
    if (!camera || !from) return
    const step = new Vector3()
    camera.getWorldDirection(step).multiplyScalar(direction * 2)
    glide({
      position: {
        x: from.position.x + step.x,
        y: from.position.y + step.y,
        z: from.position.z + step.z,
      },
      target: from.target,
    })
  }

  /** Straight above the building, looking down: the easiest angle for placing on the ground. */
  const topDown = (rooms: Room[]) => {
    const camera = cameraRef.value
    if (camera) glide(topView(rooms, camera.fov, camera.aspect))
  }

  const togglePanorama = () => {
    isRotating.value = !isRotating.value
  }

  const triggerExplodeView = (
    roomId: string | null,
    building: Building | null,
    isExplodedState: boolean,
  ) => {
    if (!roomId || !building) return { exploded: false, roomId: null }

    if (isExplodedState) {
      resetView()
      return { exploded: false, roomId: null }
    }

    const room = building.rooms.find((r) => r.id === roomId)
    if (!room) return { exploded: isExplodedState, roomId: null }

    const roomCenter = new Vector3(
      room.position.x,
      room.position.y + room.dimensions.height / 2,
      room.position.z,
    )

    // Aim at the room as well as moving to it, or it is not in the middle of the view.
    const offset = new Vector3(10, 10, 15)
    const position = roomCenter.clone().add(offset)
    glide({
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: roomCenter.x, y: roomCenter.y, z: roomCenter.z },
    })

    return { exploded: true, roomId: roomId }
  }

  return {
    cameraRef,
    controlsRef,
    isRotating,
    resetView,
    zoomIn: () => zoom(1),
    zoomOut: () => zoom(-1),
    topDown,
    togglePanorama,
    animateTo,
    /** Grabbing the scene mid-move hands control back at once instead of fighting the drag. */
    cancelGlide: cancelTween,
    currentView,
    triggerExplodeView,
  }
}
