import { mount, shallowMount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import NavbarButton from '../NavbarButton.vue'
import NavbarLink from '@/components/links/NavbarLink.vue'
import RequireAuthModal from '@/components/modals/authentication/RequireAuthModal.vue'

describe('NavbarButton', () => {
  describe('emits', () => {
    it('emits "click" when logged in and NavbarButton is clicked', async () => {
      const wrapper = shallowMount(NavbarButton, {
        props: { to: '/dashboards', isLoggedIn: true },
      })

      await wrapper.findComponent(NavbarLink).trigger('click')

      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('emits "locked-click" when logged out and RequireAuthModal is clicked', async () => {
      const wrapper = shallowMount(NavbarButton, {
        props: { to: '/dashboards', isLoggedIn: false },
      })

      await wrapper.findComponent(RequireAuthModal).trigger('click')

      expect(wrapper.emitted('locked-click')).toHaveLength(1)
    })
  })

  describe('slots', () => {
    it('renders slot content when logged in', () => {
      const wrapper = mount(NavbarButton, {
        props: { to: '/dashboards', isLoggedIn: true },
        slots: { default: '<span>My Link</span>' },
      })

      expect(wrapper.find('span').text()).toBe('My Link')
    })

    it('renders slot content when logged out', () => {
      const wrapper = mount(NavbarButton, {
        props: { to: '/dashboards', isLoggedIn: false },
        slots: { default: '<span>My Link</span>' },
      })

      expect(wrapper.find('span').text()).toBe('My Link')
    })
  })
})
