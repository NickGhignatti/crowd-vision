import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { mount } from '@vue/test-utils'
import SignupModal from '@/components/modals/SignupModal.vue'

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
  })

  it('does not render when isOpen is false', () => {
    mount(SignupModal, {
      props: { isOpen: false },
      global: { stubs },
    })
  })

  it('submits signup form and saves token on success', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'myuser' }),
    })

    const wrapper = mount(SignupModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    // Simulate user typing
    await wrapper.find('.username-stub').setValue('myuser')
    await wrapper.find('.mail-stub').setValue('mymail')
    await wrapper.find('.password-stub').setValue('mypass')

    // Submit form
    await wrapper.find('form').trigger('submit')

    // Assert API was called correctly
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'myuser', email: 'mymail', password: 'mypass' }),
      }),
    )

    // Assert LocalStorage updates
    // Wait for promises to resolve
    await new Promise(process.nextTick)

    expect(localStorage.getItem('isAuthenticated')).toBe('true')
    expect(localStorage.getItem('username')).toBe('myuser')

    // Assert Modal emitted close
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
