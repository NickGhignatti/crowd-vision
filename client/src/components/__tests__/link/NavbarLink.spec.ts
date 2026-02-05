import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NavbarLink from '@/components/link/NavbarLink.vue'

describe('NavbarLink.vue', () => {
  const defaultProps = {
    to: '/dashboard',
  }

  it('renders slot content', () => {
    const wrapper = mount(NavbarLink, {
      props: defaultProps,
      slots: {
        default: 'Dashboard',
      },
    })

    expect(wrapper.text()).toContain('Dashboard')
  })

  it('passes the "to" prop to the router-link', () => {
    const wrapper = mount(NavbarLink, {
      props: { to: '/settings' },
    })

    const link = wrapper.find('a')
    expect(link.attributes('to')).toBe('/settings')
  })

  it('has the correct default classes', () => {
    const wrapper = mount(NavbarLink, {
      props: defaultProps,
    })

    const link = wrapper.find('a')
    expect(link.classes()).toContain('text-slate-600')
    expect(link.classes()).toContain('hover:text-emerald-600')
    expect(link.classes()).toContain('transition-colors')
  })
})
