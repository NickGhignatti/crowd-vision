import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SignInModal from '@/components/modals/authentication/SignInModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockBeginRegister = vi.fn()
vi.mock('@/composables/auth/useKeycloakAuth.ts', () => ({
  useKeycloakAuth: () => ({
    beginRegister: mockBeginRegister,
  }),
}))

import StandardModal from '@/components/modals/StandardModal.vue'

const stubs = {
  StandardModal: {
    template: '<div><slot /></div>',
    props: ['isOpen'],
  },
}

describe('SignInModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the isOpen prop directly to the StandardModal', () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.findComponent(StandardModal).props('isOpen')).toBe(true)
  })

  it('renders no password, email, or OTP inputs (registration is a Keycloak redirect)', () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('redirects to Keycloak registration when the create-account button is clicked', async () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find((b) => b.text().includes('authentication.createAnAccount'))
    await createBtn?.trigger('click')

    expect(mockBeginRegister).toHaveBeenCalledTimes(1)
  })

  it('routes registration straight to Google (kc_idp_hint) when the Google button is clicked', async () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const buttons = wrapper.findAll('button')
    const googleBtn = buttons.find((b) => b.text().includes('authentication.continueWithGoogle'))
    await googleBtn?.trigger('click')

    expect(mockBeginRegister).toHaveBeenCalledTimes(1)
    expect(mockBeginRegister).toHaveBeenCalledWith(expect.any(String), 'google')
  })

  it('emits "switch-to-login" when the login link is clicked', async () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const buttons = wrapper.findAll('button')
    const loginBtn = buttons.find((b) => b.text().includes('authentication.login'))
    await loginBtn?.trigger('click')

    expect(wrapper.emitted('switch-to-login')).toBeTruthy()
  })

  it('emits "close" when the StandardModal emits "close"', async () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.findComponent(StandardModal).vm.$emit('close')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
