import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileDropdown from '@/components/menus/ProfileDropdown.vue'

describe('ProfileDropdown.vue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders username from localStorage', () => {
    localStorage.setItem('username', 'TestAdmin')
    const wrapper = mount(ProfileDropdown, {
      props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
    })

    expect(wrapper.text()).toContain('TestAdmin')
  })

  it('defaults username to "User" if localStorage is empty', () => {
    const wrapper = mount(ProfileDropdown, {
      props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
    })

    expect(wrapper.text()).toContain('User')
  })

  describe('Desktop View', () => {
    it('emits closeDropDown when clicking the main toggle button', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('closeDropDown')).toBeTruthy()
    })

    it('shows dropdown menu content when open', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: true, isMobileMenuOpen: false },
      })

      // Dropdown should be in DOM
      expect(wrapper.text()).toContain('nav.signedInAs')
      expect(wrapper.text()).toContain('nav.signOut')
    })

    it('emits handleLogout when clicking Sign Out in dropdown', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: true, isMobileMenuOpen: false },
      })

      // Find the logout button
      const buttons = wrapper.findAll('button')
      const logoutBtn = buttons.find((b) => b.text().includes('nav.signOut'))

      await logoutBtn?.trigger('click')

      expect(wrapper.emitted('handleLogout')).toBeTruthy()
    })
  })

  describe('Mobile View', () => {
    it('renders mobile specific layout', () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: true },
      })

      // In mobile view, the structure changes
      expect(wrapper.find('.bg-rose-50').exists()).toBe(true) // The specific logout button class
    })

    it('emits handleLogout when clicking the mobile logout button', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: true },
      })

      // Find the large red logout button
      const logoutBtn = wrapper.find('button.text-rose-600')
      await logoutBtn.trigger('click')

      expect(wrapper.emitted('handleLogout')).toBeTruthy()
    })
  })
})
