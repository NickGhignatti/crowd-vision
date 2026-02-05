import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from '../DataTable.vue'

describe('DataTable.vue', () => {
  const headers = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
  ]
  const items = Array.from({ length: 15 }, (_, i) => ({ name: `User ${i}`, role: 'Dev' }))

  it('paginates correctly', async () => {
    const wrapper = mount(DataTable, {
      props: { headers, items, itemsPerPage: 5 },
    })

    expect(wrapper.text()).toContain('User 0')
    expect(wrapper.text()).not.toContain('User 5')

    await wrapper.find('button:last-child').trigger('click') // Assuming Next is last button

    expect(wrapper.text()).toContain('User 5')
    expect(wrapper.text()).not.toContain('User 0')
  })

  it('handles auto-play', async () => {
    vi.useFakeTimers()
    const wrapper = mount(DataTable, {
      props: { headers, items, itemsPerPage: 5 },
    })

    await wrapper.find('button:first-child').trigger('click')

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    expect(wrapper.vm.isAutoPlaying).toBe(true)

    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('User 5')

    vi.useRealTimers()
  })
})
