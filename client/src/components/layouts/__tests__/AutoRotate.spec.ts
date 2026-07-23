import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { PerspectiveCamera } from 'three'
import AutoRotate from '@/components/layouts/AutoRotate.vue'

// 1. Mock @tresjs/core to capture the render loop callback and the invalidate fn
let renderCallback: ((args: { elapsed: number }) => void) | null = null

const mockOnBeforeRender = vi.fn((cb) => {
  renderCallback = cb
})
const mockInvalidate = vi.fn()

vi.mock('@tresjs/core', () => ({
  useLoop: () => ({
    onBeforeRender: mockOnBeforeRender,
  }),
  useTresContext: () => ({ renderer: { invalidate: mockInvalidate } }),
}))

// Controllable requestAnimationFrame: pump ticks only fire when we drain them.
let rafQueue: FrameRequestCallback[] = []
let nextRafId = 0
const flushRaf = (time = 16) => {
  const pending = rafQueue
  rafQueue = []
  pending.forEach((cb) => cb(time))
}

describe('AutoRotate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderCallback = null
    rafQueue = []
    nextRafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb)
      return ++nextRafId
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  // The canvas idles in on-demand render mode: onBeforeRender only fires when a
  // frame actually renders, so rotation would deadlock (no frame -> no camera
  // move -> no frame) unless something keeps requesting frames. AutoRotate pumps
  // invalidate() every animation frame while active to break that cycle.
  describe('frame pump', () => {
    it('does not request frames while inactive', () => {
      mount(AutoRotate, { props: { active: false, camera: createMockCamera() } })
      flushRaf()
      expect(mockInvalidate).not.toHaveBeenCalled()
    })

    it('requests a frame every animation frame while active', async () => {
      const wrapper = mount(AutoRotate, { props: { active: false, camera: createMockCamera() } })

      await wrapper.setProps({ active: true })
      flushRaf()
      expect(mockInvalidate).toHaveBeenCalledTimes(1)

      flushRaf()
      expect(mockInvalidate).toHaveBeenCalledTimes(2)
    })

    it('stops requesting frames once deactivated', async () => {
      const wrapper = mount(AutoRotate, { props: { active: false, camera: createMockCamera() } })

      await wrapper.setProps({ active: true })
      flushRaf()
      mockInvalidate.mockClear()

      await wrapper.setProps({ active: false })
      flushRaf()
      expect(mockInvalidate).not.toHaveBeenCalled()
    })
  })
})
