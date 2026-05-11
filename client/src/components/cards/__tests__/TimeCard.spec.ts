import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TimeCard from '../TimeCard.vue'
import { ref } from 'vue'

// Mocking useI18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('en-US'),
  }),
}))

// Mocking useDateTime
vi.mock('@/composables/core/useDateTime.ts', () => ({
  useDateTime: vi.fn(() => ({
    formattedTime: ref('12:00:00'),
  })),
}))

import { useDateTime } from '@/composables/core/useDateTime.ts'

describe('TimeCard.vue', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(TimeCard)

    // Default 'as' is 'p'
    expect(wrapper.element.tagName.toLowerCase()).toBe('p')
    expect(wrapper.text()).toBe('12:00:00')
  })

  it('renders with custom "as" prop', () => {
    const wrapper = mount(TimeCard, {
      props: {
        as: 'h2',
      },
    })

    expect(wrapper.element.tagName.toLowerCase()).toBe('h2')
    expect(wrapper.text()).toBe('12:00:00')
  })

  it('applies custom className', () => {
    const wrapper = mount(TimeCard, {
      props: {
        className: 'text-4xl font-extrabold',
      },
    })

    expect(wrapper.classes()).toContain('text-4xl')
    expect(wrapper.classes()).toContain('font-extrabold')
  })

  it('passes locale to useDateTime', () => {
    // Clear mock to ensure we count calls correctly
    vi.mocked(useDateTime).mockClear()

    mount(TimeCard)

    expect(useDateTime).toHaveBeenCalled()
    // The first argument should be the locale ref
    const callArgs = vi.mocked(useDateTime).mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(callArgs![0]).toBeDefined()
    expect(callArgs![0]!.value).toBe('en-US')
  })

  it('updates when formattedTime changes', async () => {
    const formattedTime = ref('12:00:00')
    vi.mocked(useDateTime).mockReturnValue({
      formattedTime,
    } as any)

    const wrapper = mount(TimeCard)
    expect(wrapper.text()).toBe('12:00:00')

    formattedTime.value = '12:00:01'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe('12:00:01')
  })
})
