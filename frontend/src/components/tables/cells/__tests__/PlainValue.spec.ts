import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlainValue from '../PlainValue.vue'
import type { TableBody } from '@/models/table.ts'

const row = {} as TableBody

describe('PlainValue.vue', () => {
  it('renders the raw value', () => {
    const wrapper = mount(PlainValue, {
      props: { display: { renderer: 'text' }, value: 'Room 101', row },
    })
    expect(wrapper.text()).toBe('Room 101')
  })

  it('applies the formatter when present', () => {
    const wrapper = mount(PlainValue, {
      props: { display: { renderer: 'text', format: (v) => `#${v}` }, value: 5, row },
    })
    expect(wrapper.text()).toBe('#5')
  })
})
