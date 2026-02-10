import { describe, it, expect, vi } from 'vitest'
import { useSceneControls } from '../useSceneControls'
import { type PerspectiveCamera, Vector3 } from 'three'
import type { BuildingPayload } from '@/models/building'

describe('useSceneControls', () => {
  const createMockCamera = () => ({
    position: new Vector3(0, 0, 0),
    getWorldDirection: vi.fn((target: Vector3) => {
      target.set(0, 0, -1)
      return target
    }),
  })

  it('initializes with default state', () => {
    const { cameraRef, isRotating } = useSceneControls()
    expect(cameraRef.value).toBeNull()
    expect(isRotating.value).toBe(false)
  })

  it('toggles panorama mode', () => {
    const { togglePanorama, isRotating } = useSceneControls()

    togglePanorama()
    expect(isRotating.value).toBe(true)

    togglePanorama()
    expect(isRotating.value).toBe(false)
  })

  describe('Camera Movements', () => {
    it('resets view to default position (10, 10, 10)', () => {
      const { resetView, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()
      mockCamera.position.set(100, 200, 300) // Start somewhere else

      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      resetView()

      expect(mockCamera.position.x).toBe(10)
      expect(mockCamera.position.y).toBe(10)
      expect(mockCamera.position.z).toBe(10)
    })

    it('zooms in (moves camera forward)', () => {
      const { zoomIn, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()

      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      zoomIn()

      expect(mockCamera.getWorldDirection).toHaveBeenCalled()
      expect(mockCamera.position.z).toBe(-2)
    })

    it('zooms out (moves camera backward)', () => {
      const { zoomOut, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()

      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      zoomOut()

      expect(mockCamera.position.z).toBe(2)
    })
  })

  describe('triggerExplodeView', () => {
    const mockBuilding = {
      id: 'Building-1',
      rooms: [
        {
          id: 'Room-A',
          position: { x: 10, y: 0, z: 10 },
          dimensions: { width: 10, height: 10, depth: 10 },
        },
      ],
      domains: ['']
    } as BuildingPayload

    it('returns false if inputs are missing', () => {
      const { triggerExplodeView } = useSceneControls()
      const result = triggerExplodeView(null, null, false)
      expect(result).toEqual({ exploded: false, roomId: null })
    })

    it('calculates room center and offsets camera when triggering explode', () => {
      const { triggerExplodeView, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()
      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      const result = triggerExplodeView('Room-A', mockBuilding, false)

      expect(result).toEqual({ exploded: true, roomId: 'Room-A' })
      expect(mockCamera.position.x).toBe(20)
      expect(mockCamera.position.y).toBe(15)
      expect(mockCamera.position.z).toBe(25)
    })

    it('resets view when disabling explode mode', () => {
      const { triggerExplodeView, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()
      mockCamera.position.set(50, 50, 50)
      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      // Call with isExplodedState = true to toggle OFF
      const result = triggerExplodeView('Room-A', mockBuilding, true)

      expect(result).toEqual({ exploded: false, roomId: null })

      // Should have called resetView() internally
      expect(mockCamera.position.x).toBe(10)
      expect(mockCamera.position.y).toBe(10)
      expect(mockCamera.position.z).toBe(10)
    })

    it('does nothing if room is not found', () => {
      const { triggerExplodeView, cameraRef } = useSceneControls()

      const mockCamera = createMockCamera()
      cameraRef.value = mockCamera as unknown as PerspectiveCamera

      const result = triggerExplodeView('Ghost-Room', mockBuilding, false)

      // Should return current state (exploded: false) without changes
      expect(result).toEqual({ exploded: false, roomId: null })
      expect(mockCamera.position.x).toBe(0) // Unchanged
    })
  })
})
