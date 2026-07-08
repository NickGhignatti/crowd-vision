import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AccountSettingsModal from '@/components/modals/AccountSettingsModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockFetchProfile = vi.fn()
const mockUpdateProfile = vi.fn()
const mockChangePassword = vi.fn()
vi.mock('@/composables/auth/useAccountSettings.ts', () => ({
  useAccountSettings: () => ({
    fetchProfile: mockFetchProfile,
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
  }),
}))

import StandardModal from '@/components/modals/StandardModal.vue'

const stubs = {
  StandardModal: {
    template: '<div><slot /></div>',
    props: ['isOpen', 'size'],
  },
}

describe('AccountSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchProfile.mockResolvedValue({ ok: true, email: 'mario@unibo.it', name: 'Mario Rossi' })
  })

  it('passes isOpen and size="lg" to the StandardModal', () => {
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const baseModal = wrapper.findComponent(StandardModal)
    expect(baseModal.props('isOpen')).toBe(true)
    expect(baseModal.props('size')).toBe('lg')
  })

  it('emits "close" when the StandardModal emits "close"', async () => {
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.findComponent(StandardModal).vm.$emit('close')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('prefills name/email from fetchProfile when opened', async () => {
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })
    await flushPromises()

    expect(mockFetchProfile).toHaveBeenCalledTimes(1)
    const nameInput = wrapper.find('input[type="text"]').element as HTMLInputElement
    const emailInput = wrapper.find('input[type="email"]').element as HTMLInputElement
    expect(nameInput.value).toBe('Mario Rossi')
    expect(emailInput.value).toBe('mario@unibo.it')
  })

  describe('profile section', () => {
    it('submits the edited name/email via updateProfile', async () => {
      mockUpdateProfile.mockResolvedValue({ ok: true })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      await wrapper.find('input[type="text"]').setValue('Mario Bianchi')
      await wrapper.find('input[type="email"]').setValue('new@unibo.it')
      await wrapper.find('form.profile-form').trigger('submit')
      await flushPromises()

      expect(mockUpdateProfile).toHaveBeenCalledWith('new@unibo.it', 'Mario Bianchi')
      expect(wrapper.text()).toContain('authentication.profileUpdated')
    })

    it('shows the mapped error on failure', async () => {
      mockUpdateProfile.mockResolvedValue({ ok: false, error: 'emailAlreadyRegistered' })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      await wrapper.find('form.profile-form').trigger('submit')
      await flushPromises()

      expect(wrapper.text()).toContain('authentication.emailAlreadyRegistered')
    })
  })

  describe('password section', () => {
    it('submits current/new password via changePassword', async () => {
      mockChangePassword.mockResolvedValue({ ok: true })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('old-pass')
      await passwordInputs[1].setValue('new-pass-123')
      await passwordInputs[2].setValue('new-pass-123')
      await wrapper.find('form.password-form').trigger('submit')
      await flushPromises()

      expect(mockChangePassword).toHaveBeenCalledWith('old-pass', 'new-pass-123')
      expect(wrapper.text()).toContain('authentication.passwordUpdated')
    })

    it('rejects a mismatched confirmation without calling changePassword', async () => {
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('old-pass')
      await passwordInputs[1].setValue('new-pass-123')
      await passwordInputs[2].setValue('does-not-match')
      await wrapper.find('form.password-form').trigger('submit')
      await flushPromises()

      expect(mockChangePassword).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('authentication.passwordMismatch')
    })

    it('shows the mapped error on failure', async () => {
      mockChangePassword.mockResolvedValue({ ok: false, error: 'invalidCredentials' })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('wrong-pass')
      await passwordInputs[1].setValue('new-pass-123')
      await passwordInputs[2].setValue('new-pass-123')
      await wrapper.find('form.password-form').trigger('submit')
      await flushPromises()

      expect(wrapper.text()).toContain('authentication.invalidCredentials')
    })
  })
})
