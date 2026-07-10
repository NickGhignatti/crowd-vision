import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LogInModal from '@/components/modals/authentication/LogInModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockBeginLogin = vi.fn()
const mockLoginWithPassword = vi.fn()
vi.mock('@/composables/auth/useKeycloakAuth.ts', () => ({
  useKeycloakAuth: () => ({
    beginLogin: mockBeginLogin,
    loginWithPassword: mockLoginWithPassword,
  }),
}))

import StandardModal from '@/components/modals/StandardModal.vue'

const stubs = {
  StandardModal: {
    template: '<div><slot /></div>',
    props: ['isOpen'],
  },
}

describe('LogInModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering and layout', () => {
    it('passes the isOpen prop directly to the StandardModal', () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      const baseModal = wrapper.findComponent(StandardModal)
      expect(baseModal.props('isOpen')).toBe(true)
    })

    it('renders the correct localized text for headers and buttons', () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      expect(wrapper.text()).toContain('authentication.welcomeBack')
      expect(wrapper.text()).toContain('authentication.login')
      expect(wrapper.text()).toContain('authentication.register')
    })

    it('renders an in-app username/password form', () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      expect(wrapper.find('form').exists()).toBe(true)
      expect(wrapper.find('input[type="password"]').exists()).toBe(true)
      expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2)
    })

    it('renders Google as an icon-only circular button, not a labeled one', () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      const googleBtn = wrapper.find('[aria-label="authentication.continueWithGoogle"]')
      expect(googleBtn.exists()).toBe(true)
      expect(googleBtn.text()).toBe('')
    })
  })

  describe('event forwarding', () => {
    it('emits "close" when the StandardModal emits "close"', async () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.findComponent(StandardModal).vm.$emit('close')

      expect(wrapper.emitted('close')).toBeTruthy()
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits "switch-to-signup" when the register button is clicked', async () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      const buttons = wrapper.findAll('button')
      const registerBtn = buttons.find((b) => b.text().includes('authentication.register'))

      await registerBtn?.trigger('click')

      expect(wrapper.emitted('switch-to-signup')).toBeTruthy()
      expect(wrapper.emitted('switch-to-signup')).toHaveLength(1)
    })
  })

  describe('password login', () => {
    it('submits the entered username/password via loginWithPassword', async () => {
      mockLoginWithPassword.mockResolvedValue({ ok: true })
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.find('input[type="text"]').setValue('mario')
      await wrapper.find('input[type="password"]').setValue('correct-password')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mockLoginWithPassword).toHaveBeenCalledWith('mario', 'correct-password')
    })

    it('emits "close" once the login succeeds', async () => {
      mockLoginWithPassword.mockResolvedValue({ ok: true })
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('shows the mapped error message and does not close on failure', async () => {
      mockLoginWithPassword.mockResolvedValue({ ok: false, error: 'invalidCredentials' })
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.text()).toContain('authentication.invalidCredentials')
      expect(wrapper.emitted('close')).toBeFalsy()
    })
  })

  describe('google login', () => {
    it('routes straight to Google (kc_idp_hint) when the Google button is clicked', async () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      const googleBtn = wrapper.find('[aria-label="authentication.continueWithGoogle"]')
      await googleBtn.trigger('click')

      expect(mockBeginLogin).toHaveBeenCalledTimes(1)
      expect(mockBeginLogin).toHaveBeenCalledWith(expect.any(String), 'google')
    })
  })
})
