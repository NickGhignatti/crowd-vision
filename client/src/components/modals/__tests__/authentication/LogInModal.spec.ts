import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LogInModal from '@/components/modals/authentication/LogInModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockLogin = vi.fn()
vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: () => ({
    login: mockLogin,
  }),
}))

import StandardModal from '@/components/modals/StandardModal.vue'
import UsernameInput from '@/components/inputs/authentication/UsernameInput.vue'
import PasswordInput from '@/components/inputs/authentication/PasswordInput.vue'

const stubs = {
  StandardModal: {
    template: '<div><slot /></div>',
    props: ['isOpen'],
  },
  UsernameInput: true,
  PasswordInput: true,
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
      const registerBtn = buttons.find(b => b.text().includes('authentication.register'))

      await registerBtn?.trigger('click')

      expect(wrapper.emitted('switch-to-signup')).toBeTruthy()
      expect(wrapper.emitted('switch-to-signup')).toHaveLength(1)
    })
  })

  describe('form submission', () => {
    it('calls authStore.login with the provided credentials and emits close on success', async () => {
      mockLogin.mockResolvedValueOnce(undefined)

      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.findComponent(UsernameInput).vm.$emit('update:name', 'alice')
      await wrapper.findComponent(PasswordInput).vm.$emit('update:password', 'supersecret')

      await wrapper.find('form').trigger('submit')
      await flushPromises() // Wait for the async try/catch block to resolve

      expect(mockLogin).toHaveBeenCalledTimes(1)
      expect(mockLogin).toHaveBeenCalledWith('alice', 'supersecret')

      // If login succeeds, the modal should command itself to close
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('catches the error, reports it, and does NOT emit close on failure', async () => {
      // Suppress the expected console output to keep test output clean
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const expectedError = new Error('Invalid credentials')
      mockLogin.mockRejectedValueOnce(expectedError)

      const wrapper = mount(LogInModal, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.findComponent(UsernameInput).vm.$emit('update:name', 'bob')
      await wrapper.findComponent(PasswordInput).vm.$emit('update:password', 'wrongpassword')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mockLogin).toHaveBeenCalledTimes(1)

      // Expect the error to be reported as per the catch(e) block
      expect(logSpy).toHaveBeenCalledWith(expectedError)

      // The modal should stay open
      expect(wrapper.emitted('close')).toBeUndefined()

      logSpy.mockRestore()
    })
  })
})
