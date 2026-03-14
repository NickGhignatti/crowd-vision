import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LoginModal from '../LoginModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

global.fetch = vi.fn()

const stubs = {
  Teleport: true,
  Transition: true,
  UsernameInput: {
    template:
      '<input class="name-stub" :value="name" @input="$emit(\'update:name\', $event.target.value)" />',
    props: ['name'],
  },
  PasswordInput: {
    template:
      '<input class="password-stub" :value="password" @input="$emit(\'update:password\', $event.target.value)" />',
    props: ['password'],
  },
}

describe('LoginModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(global.fetch as Mock).mockReset()
  })

  it('does not render when isOpen is false', () => {
    const wrapper = mount(LoginModal, {
      props: { isOpen: false },
      global: { stubs },
    })

    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('submits login form and saves token on success', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'fake-jwt-token',
        account: { accountName: 'my-account' },
      }),
    })

    const wrapper = mount(LoginModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('.name-stub').setValue('my-account')
    await wrapper.find('.password-stub').setValue('mypass')

    await wrapper.find('form').trigger('submit')

    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-account', password: 'mypass' }),
      }),
    )

    expect(localStorage.getItem('isAuthenticated')).toBe('true')
    expect(localStorage.getItem('token')).toBe('fake-jwt-token')
    expect(localStorage.getItem('account-name')).toBe('my-account')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
