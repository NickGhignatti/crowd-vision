import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DateCard from '../DateCard.vue'
import { ref } from 'vue'

// Mocking useI18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('en-US'),
  }),
}))

// Mocking useDateTime
vi.mock('@/composables/useDateTime.ts', () => ({
  useDateTime: vi.fn(() => ({
    formattedDate: ref('Monday, May 10, 2026'),
  })),
}))

import { useDateTime } from '@/composables/core/useDateTime.ts'

describe('DateCard.vue', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(DateCard)

    // Default 'as' is 'p'
    expect(wrapper.element.tagName.toLowerCase()).toBe('p')
    expect(wrapper.text()).toBe('Monday, May 10, 2026')
  })

  it('renders with custom "as" prop', () => {
    const wrapper = mount(DateCard, {
      props: {
        as: 'h2',
      },
    })

    expect(wrapper.element.tagName.toLowerCase()).toBe('h2')
    expect(wrapper.text()).toBe('Monday, May 10, 2026')
  })

  it('applies custom className', () => {
    const wrapper = mount(DateCard, {
      props: {
        className: 'text-xl font-bold',
      },
    })

    expect(wrapper.classes()).toContain('text-xl')
    expect(wrapper.classes()).toContain('font-bold')
  })

  it('passes locale to useDateTime', () => {
    mount(DateCard)

    expect(useDateTime).toHaveBeenCalled()
    // The first argument should be the locale ref
    const callArgs = vi.mocked(useDateTime).mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(callArgs![0]).toBeDefined()
    expect(callArgs![0]!.value).toBe('en-US')
  })

  it('updates when formattedDate changes', async () => {
    const formattedDate = ref('Monday, May 10, 2026')
    vi.mocked(useDateTime).mockReturnValue({
      formattedDate,
    } as any)

    const wrapper = mount(DateCard)
    expect(wrapper.text()).toBe('Monday, May 10, 2026')

    formattedDate.value = 'Tuesday, May 11, 2026'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe('Tuesday, May 11, 2026')
  })
})
