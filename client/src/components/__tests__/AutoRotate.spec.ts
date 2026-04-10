import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { PerspectiveCamera } from 'three'
import AutoRotate from '@/components/AutoRotate.vue'

// 1. Mock @tresjs/core to capture the render loop callback
let renderCallback: ((args: { elapsed: number }) => void) | null = null

const mockOnBeforeRender = vi.fn((cb) => {
  renderCallback = cb
})

vi.mock('@tresjs/core', () => ({
  useLoop: () => ({
    onBeforeRender: mockOnBeforeRender,
  }),
}))

describe('AutoRotate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderCallback = null
  })

  const createMockCamera = () =>
    ({
      position: { x: 0, y: 0, z: 0 },
      lookAt: vi.fn(),
    }) as unknown as PerspectiveCamera

  describe('rendering', () => {
    it('renders the default slot content', () => {
      const wrapper = mount(AutoRotate, {
        props: { active: false, camera: null },
        slots: { default: '<div class="slotted-content">Test Cube</div>' },
      })
      expect(wrapper.find('.slotted-content').exists()).toBe(true)
    })

    it('registers the onBeforeRender hook from useLoop exactly once', () => {
      mount(AutoRotate, { props: { active: false, camera: null } })
      expect(mockOnBeforeRender).toHaveBeenCalledTimes(1)
      expect(typeof renderCallback).toBe('function')
    })
  })

  describe('render loop behavior', () => {
    it('updates camera position and calls lookAt when active', () => {
      const mockCamera = createMockCamera()
      mount(AutoRotate, { props: { active: true, camera: mockCamera } })

      // Simulate the TresJS render loop firing with 10 seconds elapsed
      renderCallback!({ elapsed: 10 })

      const speed = 10 * 0.35
      const radius = 40

      expect(mockCamera.position.x).toBe(Math.cos(speed) * radius)
      expect(mockCamera.position.z).toBe(Math.sin(speed) * radius)
      expect(mockCamera.position.y).toBe(15) // Fixed height

      expect(mockCamera.lookAt).toHaveBeenCalledTimes(1)
      expect(mockCamera.lookAt).toHaveBeenCalledWith(0, 0, 0)
    })

    it('does not modify the camera when active is false', () => {
      const mockCamera = createMockCamera()
      mount(AutoRotate, { props: { active: false, camera: mockCamera } })

      renderCallback!({ elapsed: 10 })

      expect(mockCamera.position.x).toBe(0)
      expect(mockCamera.position.z).toBe(0)
      expect(mockCamera.position.y).toBe(0)
      expect(mockCamera.lookAt).not.toHaveBeenCalled()
    })

    it('does not throw errors if the camera prop is null', () => {
      mount(AutoRotate, { props: { active: true, camera: null } })

      expect(() => {
        renderCallback!({ elapsed: 10 })
      }).not.toThrow()
    })

    it('does not throw errors if the camera has no position object', () => {
      const corruptedCamera = { lookAt: vi.fn() } as unknown as PerspectiveCamera
      mount(AutoRotate, { props: { active: true, camera: corruptedCamera } })

      expect(() => {
        renderCallback!({ elapsed: 10 })
      }).not.toThrow()
      expect(corruptedCamera.lookAt).not.toHaveBeenCalled()
    })
  })
})
