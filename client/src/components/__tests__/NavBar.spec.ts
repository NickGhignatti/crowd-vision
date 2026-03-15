import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NavBar from '../NavBar.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

const stubs = {
  NavLink: { template: '<button class="nav-link-stub" @click="$emit(\'locked-click\')"><slot /></button>' },
  LoginModal: { props: ['isOpen'], template: '<div class="login-modal-stub" :data-open="isOpen" />' },
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
    localStorage.setItem('account-name', 'TestAccount')

    const wrapper = mount(NavBar, { global: { stubs } })
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'ProfileDropdown' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('authentication.getStarted')
  })

  it('opens login modal when clicking require-login link', async () => {
    const wrapper = mount(NavBar, { global: { stubs } })

    const dashboardLink = wrapper.find('.nav-link-stub')
    await dashboardLink.trigger('click')

    const loginModal = wrapper.find('.login-modal-stub')
    expect(loginModal.attributes('data-open')).toBe('true')
  })
})
