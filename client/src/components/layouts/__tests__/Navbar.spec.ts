import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import NavBar from '@/components/layouts/NavBar.vue'

const isLoggedIn = ref(false)
const handleLogout = vi.fn()

vi.mock('@/composables/auth/useAuth', () => ({
  useAuth: () => ({ isLoggedIn, handleLogout }),
}))

vi.mock('@/composables/ui/useNavLinks', () => ({
  useNavLinks: () => ({ links: [{ to: '/dashboards', label: () => 'Dashboard' }] }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const LoginModalStub = {
  props: ['isOpen'],
  emits: ['close', 'switch-to-signup'],
  template: '<div class="login-modal-stub" :data-open="isOpen" />',
}

const SignUpModalStub = {
  props: ['isOpen'],
  emits: ['close', 'switch-to-login'],
  template: '<div class="signup-modal-stub" :data-open="isOpen" />',
}

const stubs = {
  NavbarLink: {
    props: ['to', 'isLoggedIn'],
    emits: ['locked-click'],
    template: '<button class="nav-links-stub" @click="$emit(\'locked-click\')"><slot /></button>',
  },
  LogInModal: LoginModalStub,
  SignInModal: SignUpModalStub,
  ProfileDropdown: {
    props: ['isUserDropdownOpen', 'isMobileMenuOpen'],
    emits: ['handle-logout', 'close-drop-down'],
    template: '<div class="profile-dropdown-stub" @click="$emit(\'handle-logout\')" />',
  },
  LanguageDropdown: true,
  NotificationButton: true,
}

beforeEach(() => {
  isLoggedIn.value = false
  vi.clearAllMocks()
})

describe('NavBar', () => {
  describe('auth state', () => {
    it('shows login and signup buttons when logged out', () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      expect(wrapper.text()).toContain('authentication.login')
      expect(wrapper.text()).toContain('authentication.getStarted')
      expect(wrapper.find('.profile-dropdown-stub').exists()).toBe(false)
    })

    it('shows profile dropdown and hides auth buttons when logged in', () => {
      isLoggedIn.value = true
      const wrapper = mount(NavBar, { global: { stubs } })
      expect(wrapper.find('.profile-dropdown-stub').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('authentication.getStarted')
    })

    it('delegates logout to handleLogout when Profile emits it', async () => {
      isLoggedIn.value = true
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.find('.profile-dropdown-stub').trigger('click')
      expect(handleLogout).toHaveBeenCalledTimes(1)
    })
  })

  describe('login modal', () => {
    it('opens when a locked NavbarLink emits locked-click', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.find('.nav-links-stub').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.login-modal-stub').attributes('data-open')).toBe('true')
    })

    it('opens when the desktop login button is clicked', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      const loginBtn = wrapper.findAll('button').find((b) => b.text() === 'authentication.login')
      await loginBtn!.trigger('click')
      expect(wrapper.find('.login-modal-stub').attributes('data-open')).toBe('true')
    })

    it('closes when it emits close', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.find('.nav-links-stub').trigger('click') // open first
      await wrapper.vm.$nextTick()
      await wrapper.findComponent(LoginModalStub).vm.$emit('close')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.login-modal-stub').attributes('data-open')).toBe('false')
    })
  })

  describe('signup modal', () => {
    it('opens when the desktop signup button is clicked', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      const signupBtn = wrapper
        .findAll('button')
        .find((b) => b.text() === 'authentication.getStarted')
      await signupBtn!.trigger('click')
      expect(wrapper.find('.signup-modal-stub').attributes('data-open')).toBe('true')
    })

    it('switches from login to signup when LogInModal emits switch-to-signup', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.findComponent(LoginModalStub).vm.$emit('switch-to-signup')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.signup-modal-stub').attributes('data-open')).toBe('true')
      expect(wrapper.find('.login-modal-stub').attributes('data-open')).toBe('false')
    })
  })

  describe('mobile menu', () => {
    it('is hidden by default', () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      expect(wrapper.find('.md\\:hidden.border-t').exists()).toBe(false)
    })

    it('toggles open and closed with the hamburger button', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      const hamburger = wrapper.find('button.p-2')
      await hamburger.trigger('click')
      expect(wrapper.find('.md\\:hidden.border-t').exists()).toBe(true)
      await hamburger.trigger('click')
      expect(wrapper.find('.md\\:hidden.border-t').exists()).toBe(false)
    })

    it('opens login modal and closes mobile menu when mobile login button is clicked', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.find('button.p-2').trigger('click')
      await wrapper.find('.md\\:hidden.border-t button.border-slate-200').trigger('click')
      expect(wrapper.find('.login-modal-stub').attributes('data-open')).toBe('true')
      expect(wrapper.find('.md\\:hidden.border-t').exists()).toBe(false)
    })

    it('opens signup modal and closes mobile menu when mobile signup button is clicked', async () => {
      const wrapper = mount(NavBar, { global: { stubs } })
      await wrapper.find('button.p-2').trigger('click')
      await wrapper.find('.md\\:hidden.border-t button.bg-slate-900').trigger('click')
      expect(wrapper.find('.signup-modal-stub').attributes('data-open')).toBe('true')
      expect(wrapper.find('.md\\:hidden.border-t').exists()).toBe(false)
    })
  })
})
