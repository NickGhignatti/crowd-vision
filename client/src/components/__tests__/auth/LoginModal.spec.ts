import { mount } from '@vue/test-utils'
import LoginModal from '@/components/modals/LoginModal.vue'

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

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
  })

  it('submits login form and saves token on success', async () => {
    ; (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'myuser' }),
    })

    const wrapper = mount(LoginModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    // Simulate user typing
    await wrapper.find('.username-stub').setValue('myuser')
    await wrapper.find('.password-stub').setValue('mypass')

    // Submit form
    await wrapper.find('form').trigger('submit')

    // Assert API was called correctly
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'myuser', password: 'mypass' }),
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
