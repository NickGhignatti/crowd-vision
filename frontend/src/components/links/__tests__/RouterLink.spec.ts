import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RouterLink from '../RouterLink.vue'

describe('RouterLink', () => {
  const defaultProps = {
    to: '/dashboards',
  }

  it('renders slot content', () => {
    const wrapper = mount(RouterLink, {
      props: defaultProps,
      slots: {
        default: 'Dashboard',
      },
    })

    expect(wrapper.text()).toContain('Dashboard')
  })

  it('passes the "to" prop to the router-links', () => {
    const wrapper = mount(RouterLink, {
      props: { to: '/settings' },
    })

    const link = wrapper.find('a')
    expect(link.attributes('to')).toBe('/settings')
  })

  it('has the correct default classes', () => {
    const wrapper = mount(RouterLink, {
      props: defaultProps,
    })

    const link = wrapper.find('a')
    expect(link.classes()).toContain('text-slate-600')
    expect(link.classes()).toContain('hover:text-emerald-600')
    expect(link.classes()).toContain('transition-colors')
  })
})
