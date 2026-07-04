import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LogInModal from '@/components/modals/authentication/LogInModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockBeginLogin = vi.fn()
vi.mock('@/composables/auth/useKeycloakAuth.ts', () => ({
  useKeycloakAuth: () => ({
    beginLogin: mockBeginLogin,
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
      expect(wrapper.text()).toContain('authentication.continueWithOrg')
      expect(wrapper.text()).toContain('authentication.register')
    })

    it('renders no password or username inputs (login is a Keycloak redirect)', () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      expect(wrapper.find('input[type="password"]').exists()).toBe(false)
      expect(wrapper.find('form').exists()).toBe(false)
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

  describe('login', () => {
    it('redirects to Keycloak via beginLogin when the continue button is clicked', async () => {
      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      const buttons = wrapper.findAll('button')
      const continueBtn = buttons.find((b) => b.text().includes('authentication.continueWithOrg'))
      await continueBtn?.trigger('click')

      expect(mockBeginLogin).toHaveBeenCalledTimes(1)
    })
  })
})
