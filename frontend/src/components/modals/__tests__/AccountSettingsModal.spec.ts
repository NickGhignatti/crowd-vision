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
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue'
import UserAvatar from '@/components/avatars/UserAvatar.vue'

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

    const baseModal = wrapper.findAllComponents(StandardModal)[0]
    expect(baseModal.props('isOpen')).toBe(true)
    expect(baseModal.props('size')).toBe('lg')
  })

  it('emits "close" when the StandardModal emits "close"', async () => {
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.findAllComponents(StandardModal)[0].vm.$emit('close')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows the fetched name/email as read-only text when opened', async () => {
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })
    await flushPromises()

    expect(mockFetchProfile).toHaveBeenCalledTimes(1)
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    expect(wrapper.find('input[type="email"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mario Rossi')
    expect(wrapper.text()).toContain('mario@unibo.it')
  })

  it('passes the fetched picture to UserAvatar', async () => {
    mockFetchProfile.mockResolvedValue({
      ok: true,
      email: 'mario@unibo.it',
      name: 'Mario Rossi',
      picture: 'https://lh3.googleusercontent.com/a/abc',
    })
    const wrapper = mount(AccountSettingsModal, {
      props: { isOpen: true },
      global: { stubs },
    })
    await flushPromises()

    expect(wrapper.findComponent(UserAvatar).props('picture')).toBe(
      'https://lh3.googleusercontent.com/a/abc',
    )
  })

  describe('profile editing', () => {
    it('switches to an editable form prefilled with the current values when the pencil is clicked', async () => {
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      await wrapper.find('button[aria-label="authentication.editProfile"]').trigger('click')

      const nameInput = wrapper.find('input[type="text"]').element as HTMLInputElement
      const emailInput = wrapper.find('input[type="email"]').element as HTMLInputElement
      expect(nameInput.value).toBe('Mario Rossi')
      expect(emailInput.value).toBe('mario@unibo.it')
    })

    it('discards edits and returns to read-only mode on cancel', async () => {
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()
      await wrapper.find('button[aria-label="authentication.editProfile"]').trigger('click')

      await wrapper.find('input[type="text"]').setValue('Mario Bianchi')
      await wrapper.find('form.profile-form').findAll('button')[1].trigger('click')

      expect(mockUpdateProfile).not.toHaveBeenCalled()
      expect(wrapper.find('input[type="text"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Mario Rossi')
    })

    it('submits the edited name/email via updateProfile and returns to read-only mode', async () => {
      mockUpdateProfile.mockResolvedValue({ ok: true })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()
      await wrapper.find('button[aria-label="authentication.editProfile"]').trigger('click')

      await wrapper.find('input[type="text"]').setValue('Mario Bianchi')
      await wrapper.find('input[type="email"]').setValue('new@unibo.it')
      await wrapper.find('form.profile-form').trigger('submit')
      await flushPromises()

      expect(mockUpdateProfile).toHaveBeenCalledWith('new@unibo.it', 'Mario Bianchi')
      expect(wrapper.find('input[type="text"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Mario Bianchi')
      expect(wrapper.text()).toContain('authentication.profileUpdated')
    })

    it('shows the mapped error and stays in edit mode on failure', async () => {
      mockUpdateProfile.mockResolvedValue({ ok: false, error: 'emailAlreadyRegistered' })
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()
      await wrapper.find('button[aria-label="authentication.editProfile"]').trigger('click')

      await wrapper.find('form.profile-form').trigger('submit')
      await flushPromises()

      expect(wrapper.text()).toContain('authentication.emailAlreadyRegistered')
      expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    })
  })

  describe('password section', () => {
    it('renders a button that toggles the ChangePasswordModal open', async () => {
      const wrapper = mount(AccountSettingsModal, {
        props: { isOpen: true },
        global: { stubs },
      })
      await flushPromises()

      expect(wrapper.findComponent(ChangePasswordModal).props('isOpen')).toBe(false)

      const changePasswordButton = wrapper
        .findAll('button')
        .find((b) => b.text().includes('authentication.changePassword'))
      expect(changePasswordButton).toBeTruthy()

      await changePasswordButton!.trigger('click')

      expect(wrapper.findComponent(ChangePasswordModal).props('isOpen')).toBe(true)
    })
  })
})
