import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RenderInvalidator from '@/components/scene/RenderInvalidator.vue'

const mockInvalidate = vi.fn()

vi.mock('@tresjs/core', () => ({
  useTresContext: () => ({ renderer: { invalidate: mockInvalidate } }),
}))

describe('RenderInvalidator.vue', () => {
  beforeEach(() => {
    mockInvalidate.mockClear()
  })

  it('requests a frame on mount, so the first paint happens even in on-demand mode', () => {
    mount(RenderInvalidator, { props: { trigger: 0 } })
    expect(mockInvalidate).toHaveBeenCalledTimes(1)
  })

  it('requests a frame whenever the trigger prop changes', async () => {
    const wrapper = mount(RenderInvalidator, { props: { trigger: 0 } })
    mockInvalidate.mockClear()

    await wrapper.setProps({ trigger: 1 })
    expect(mockInvalidate).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ trigger: 'colour-changed' })
    expect(mockInvalidate).toHaveBeenCalledTimes(2)
  })

  it('does not request a frame when set to the same trigger value', async () => {
    const wrapper = mount(RenderInvalidator, { props: { trigger: 0 } })
    mockInvalidate.mockClear()

    await wrapper.setProps({ trigger: 0 })
    expect(mockInvalidate).not.toHaveBeenCalled()
  })
})
