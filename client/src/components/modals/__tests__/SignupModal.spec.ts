import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignupModal from '../SignupModal.vue'

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
  MailInput: {
    template:
      '<input class="mail-stub" :value="mail" @input="$emit(\'update:mail\', $event.target.value)" />',
    props: ['mail'],
  },
  PasswordInput: {
    template:
      '<input class="password-stub" :value="password" @input="$emit(\'update:password\', $event.target.value)" />',
    props: ['password'],
  },
}

describe('SignupModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(global.fetch as Mock).mockReset()
  })

  it('does not render when isOpen is false', () => {
    const wrapper = mount(SignupModal, {
      props: { isOpen: false },
      global: { stubs },
    })

    // Actually assert that the form isn't there
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('submits signup form and saves token on success', async () => {
    // 3. Provide the full expected response structure, including the token
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'fake-jwt-token',
        user: { username: 'myuser' },
      }),
    })

    const wrapper = mount(SignupModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('.username-stub').setValue('myuser')
    await wrapper.find('.mail-stub').setValue('mymail')
    await wrapper.find('.password-stub').setValue('mypass')

    await wrapper.find('form').trigger('submit')

    // 4. Wait for ALL pending promises (fetch & .json()) to resolve
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'myuser', email: 'mymail', password: 'mypass' }),
      }),
    )

    expect(localStorage.getItem('isAuthenticated')).toBe('true')
    expect(localStorage.getItem('token')).toBe('fake-jwt-token')
    expect(localStorage.getItem('username')).toBe('myuser')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
