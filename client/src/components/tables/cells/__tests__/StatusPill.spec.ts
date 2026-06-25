import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusPill from '../StatusPill.vue'
import type { TableBody } from '@/models/table.ts'

const row = {} as TableBody
const display = { renderer: 'pill' as const }

describe('StatusPill.vue', () => {
  it('colours the pill from the status key', () => {
    const wrapper = mount(StatusPill, {
      props: { display, value: 'dashboard.table.rooms.status.crowded', row },
    })
    expect(wrapper.classes()).toContain('text-orange-600')
  })

  it('renders a dot and the translated label', () => {
    // vue-i18n is globally mocked to echo the key.
    const wrapper = mount(StatusPill, {
      props: { display, value: 'dashboard.table.rooms.status.empty', row },
    })
    expect(wrapper.find('.bg-current').exists()).toBe(true)
    expect(wrapper.text()).toBe('dashboard.table.rooms.status.empty')
    expect(wrapper.classes()).toContain('text-emerald-600')
  })

  it('handles a nullish value without crashing', () => {
    const wrapper = mount(StatusPill, { props: { display, value: undefined, row } })
    expect(wrapper.find('.bg-current').exists()).toBe(true)
  })
})
