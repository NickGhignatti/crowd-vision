import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NavBar from '@/components/NavBar.vue'
import RequireLogin from '@/components/modals/RequireLogin.vue'

const stubs = {
  LoginModal: true,
  SignUpModal: true,
  RequireLogin: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  NotificationDropdown: true,
  ProfileDropdown: true,
  LanguageSelector: true,
}

describe('NavBar.vue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows login/signup buttons when not authenticated', () => {
    const wrapper = mount(NavBar, { global: { stubs } })
    expect(wrapper.text()).toContain('authentication.login')
    expect(wrapper.text()).toContain('authentication.getStarted')
    expect(wrapper.findComponent({ name: 'ProfileDropdown' }).exists()).toBe(false)
  })

  it('shows profile dropdown when authenticated', async () => {
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('username', 'TestUser')

    const wrapper = mount(NavBar, { global: { stubs } })
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'ProfileDropdown' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('authentication.getStarted')
  })

  it('opens login modal when clicking require-login link', async () => {
    const wrapper = mount(NavBar, { global: { stubs } })

    const dashboardLink = wrapper.findAllComponents(RequireLogin)[0]
    if (dashboardLink) await dashboardLink.trigger('click')

    const loginModal = wrapper.findComponent({ name: 'LoginModal' })
    expect(loginModal.props('isOpen')).toBe(true)
  })
})
