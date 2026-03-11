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
      '<input class="username-stub" :value="username" @input="$emit(\'update:username\', $event.target.value)" />',
    props: ['username'],
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
        user: { username: 'myuser' },
      }),
    })

    const wrapper = mount(LoginModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('.username-stub').setValue('myuser')
    await wrapper.find('.password-stub').setValue('mypass')

    await wrapper.find('form').trigger('submit')

    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'myuser', password: 'mypass' }),
      }),
    )

    expect(localStorage.getItem('isAuthenticated')).toBe('true')
    expect(localStorage.getItem('token')).toBe('fake-jwt-token')
    expect(localStorage.getItem('username')).toBe('myuser')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
