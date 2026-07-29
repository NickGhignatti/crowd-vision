import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockChangePassword = vi.fn()
vi.mock('@/composables/auth/useAccountSettings.ts', () => ({
  useAccountSettings: () => ({
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

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes isOpen to the StandardModal', () => {
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.findComponent(StandardModal).props('isOpen')).toBe(true)
  })

  it('emits "close" when the StandardModal emits "close"', async () => {
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.findComponent(StandardModal).vm.$emit('close')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('submits current/new password via changePassword', async () => {
    mockChangePassword.mockResolvedValue({ ok: true })
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const passwordInputs = wrapper.findAll('input[type="password"]')
    await passwordInputs[0].setValue('old-pass')
    await passwordInputs[1].setValue('new-pass-123')
    await passwordInputs[2].setValue('new-pass-123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockChangePassword).toHaveBeenCalledWith('old-pass', 'new-pass-123')
    expect(wrapper.text()).toContain('authentication.passwordUpdated')
  })

  it('rejects a mismatched confirmation without calling changePassword', async () => {
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const passwordInputs = wrapper.findAll('input[type="password"]')
    await passwordInputs[0].setValue('old-pass')
    await passwordInputs[1].setValue('new-pass-123')
    await passwordInputs[2].setValue('does-not-match')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('authentication.passwordMismatch')
  })

  it('shows the mapped error on failure', async () => {
    mockChangePassword.mockResolvedValue({ ok: false, error: 'invalidCredentials' })
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const passwordInputs = wrapper.findAll('input[type="password"]')
    await passwordInputs[0].setValue('wrong-pass')
    await passwordInputs[1].setValue('new-pass-123')
    await passwordInputs[2].setValue('new-pass-123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('authentication.invalidCredentials')
  })

  it('clears the fields after opening again', async () => {
    const wrapper = mount(ChangePasswordModal, {
      props: { isOpen: false },
      global: { stubs },
    })

    await wrapper.setProps({ isOpen: true })
    const passwordInputs = wrapper.findAll('input[type="password"]')
    expect((passwordInputs[0].element as HTMLInputElement).value).toBe('')
  })
})
