import { mount, shallowMount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import NavLink from '../NavLink.vue'
import NavbarLink from '@/components/link/NavbarLink.vue'
import RequireLogin from '@/components/modals/RequireLogin.vue'

describe('AuthNavbarLink', () => {
  describe('1. Emits', () => {
    it('emits "click" when logged in and NavbarLink is clicked', async () => {
      const wrapper = shallowMount(NavLink, {
        props: { to: '/dashboard', isLoggedIn: true },
      })

      await wrapper.findComponent(NavbarLink).trigger('click')

      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('emits "locked-click" when logged out and RequireLogin is clicked', async () => {
      const wrapper = shallowMount(NavLink, {
        props: { to: '/dashboard', isLoggedIn: false },
      })

      await wrapper.findComponent(RequireLogin).trigger('click')

      expect(wrapper.emitted('locked-click')).toHaveLength(1)
    })
  })

  describe('2. Slots', () => {
    it('renders slot content when logged in', () => {
      const wrapper = mount(NavLink, {
        props: { to: '/dashboard', isLoggedIn: true },
        slots: { default: '<span>My Link</span>' },
      })

      expect(wrapper.find('span').text()).toBe('My Link')
    })

    it('renders slot content when logged out', () => {
      const wrapper = mount(NavLink, {
        props: { to: '/dashboard', isLoggedIn: false },
        slots: { default: '<span>My Link</span>' },
      })

      expect(wrapper.find('span').text()).toBe('My Link')
    })
  })
})
