import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AutoRotate from '../AutoRotate.vue'
import type { PerspectiveCamera } from 'three'

const mocks = vi.hoisted(() => ({
  triggerRender: null as null | ((ctx: { elapsed: number }) => void),
}))

// 2. Mock TresJS
vi.mock('@tresjs/core', () => ({
  useLoop: () => ({
    onBeforeRender: (cb: (ctx: { elapsed: number }) => void) => {
      mocks.triggerRender = cb
    },
  }),
}))

describe('AutoRotate.vue', () => {
  it('renders slot content', () => {
    const wrapper = mount(AutoRotate, {
      props: { active: true, camera: null },
      slots: { default: '<div class="child">Content</div>' },
    })
    expect(wrapper.find('.child').exists()).toBe(true)
  })

  it('updates camera position when active', () => {
    const mockCamera = {
      position: { x: 0, y: 0, z: 0 },
      lookAt: vi.fn(),
    } as unknown as PerspectiveCamera

    mount(AutoRotate, {
      props: {
        active: true,
        camera: mockCamera,
      },
    })

    // Trigger the render loop using the hoisted function
    // The optional chaining (?.) prevents a crash if it wasn't assigned (though it should be)
    mocks.triggerRender?.({ elapsed: 1 })

    expect(mockCamera.position.x).not.toBe(0)
    expect(mockCamera.position.y).toBe(15)
    expect(mockCamera.lookAt).toHaveBeenCalled()
  })
})
