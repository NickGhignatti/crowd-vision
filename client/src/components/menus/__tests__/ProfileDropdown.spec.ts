import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ProfileDropdown from '@/components/menus/ProfileDropdown.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockAccountName = ref<string | null>('alice')
vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: () => ({
    get accountName() {
      return mockAccountName.value
    },
  }),
}))

describe('ProfileDropdown.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountName.value = 'alice'
  })

  describe('desktop layout (!isMobileMenuOpen)', () => {
    it('renders the trigger button with the account name', () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
      })

      expect(wrapper.text()).toContain('alice')

      expect(wrapper.text()).not.toContain('authentication.signedInAs')
      expect(wrapper.text()).not.toContain('authentication.logout')
    })

    it('shows the dropdown content when isUserDropdownOpen is true', () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: true, isMobileMenuOpen: false },
      })

      expect(wrapper.text()).toContain('authentication.signedInAs')
      expect(wrapper.text()).toContain('alice')
      expect(wrapper.text()).toContain('authentication.logout')
    })

    it('emits "closeDropDown" when the main trigger button is clicked', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('closeDropDown')).toBeTruthy()
      expect(wrapper.emitted('closeDropDown')).toHaveLength(1)
    })

    it('emits "handleLogout" when the logout button in the dropdown is clicked', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: true, isMobileMenuOpen: false },
      })

      const logoutBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('authentication.logout'))
      await logoutBtn?.trigger('click')

      expect(wrapper.emitted('handleLogout')).toBeTruthy()
      expect(wrapper.emitted('handleLogout')).toHaveLength(1)
    })
  })

  describe('mobile layout (isMobileMenuOpen)', () => {
    it('renders the inline mobile view instead of a dropdown trigger', () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: true },
      })

      expect(wrapper.text()).toContain('authentication.signedInAs')
      expect(wrapper.text()).toContain('alice')
      expect(wrapper.text()).toContain('authentication.logout')
    })

    it('emits "handleLogout" when the mobile logout button is clicked', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: true },
      })

      const logoutBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('authentication.logout'))
      await logoutBtn?.trigger('click')

      expect(wrapper.emitted('handleLogout')).toBeTruthy()
      expect(wrapper.emitted('handleLogout')).toHaveLength(1)
    })

    it('does not emit "closeDropDown" in the mobile view since the trigger button does not exist', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: true },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('closeDropDown')).toBeUndefined()
    })
  })

  describe('computed state', () => {
    it('falls back to "Account" if the store returns a null accountName', () => {
      mockAccountName.value = null

      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
      })

      expect(wrapper.text()).toContain('Account')
    })

    it('reacts dynamically if the store accountName changes', async () => {
      const wrapper = mount(ProfileDropdown, {
        props: { isUserDropdownOpen: false, isMobileMenuOpen: false },
      })

      expect(wrapper.text()).toContain('alice')

      mockAccountName.value = 'bob'

      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('bob')
      expect(wrapper.text()).not.toContain('alice')
    })
  })
})
