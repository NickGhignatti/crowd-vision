import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DomainBuildingGroup from '../DomainBuildingGroup.vue'

const createWrapper = (props: { name?: string; count?: number; open?: boolean } = {}) =>
  mount(DomainBuildingGroup, {
    props: { name: 'unibo.it', count: 2, open: true, ...props },
    slots: { default: '<div class="child">card</div>' },
  })

describe('DomainBuildingGroup.vue', () => {
  it('renders the domain name and building count', () => {
    const wrapper = createWrapper({ name: 'polimi.it', count: 3 })
    expect(wrapper.text()).toContain('polimi.it')
    expect(wrapper.text()).toContain('(3)')
  })

  it('renders slotted content', () => {
    expect(createWrapper().find('.child').exists()).toBe(true)
  })

  it('shows the content wrapper when open and hides it when closed', () => {
    expect(createWrapper({ open: true }).find('.space-y-1').attributes('style')).toBeUndefined()
    expect(createWrapper({ open: false }).find('.space-y-1').attributes('style')).toContain(
      'display: none',
    )
  })

  it('points the caret down when open and rotates it when closed', () => {
    expect(createWrapper({ open: true }).find('i').classes()).not.toContain('-rotate-90')
    expect(createWrapper({ open: false }).find('i').classes()).toContain('-rotate-90')
  })

  it('reflects the open state on aria-expanded', () => {
    expect(createWrapper({ open: true }).find('button').attributes('aria-expanded')).toBe('true')
    expect(createWrapper({ open: false }).find('button').attributes('aria-expanded')).toBe('false')
  })

  it('emits toggle when the header is clicked', async () => {
    const wrapper = createWrapper()
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
