import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignInModal from '@/components/modals/authentication/SignInModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockBeginRegister = vi.fn()
const mockRegisterWithPassword = vi.fn()
vi.mock('@/composables/auth/useKeycloakAuth.ts', () => ({
  useKeycloakAuth: () => ({
    beginRegister: mockBeginRegister,
    registerWithPassword: mockRegisterWithPassword,
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

  it('renders an in-app email/password form', () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2)
  })

  it('renders Google as an icon-only circular button, not a labeled one', () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const googleBtn = wrapper.find('[aria-label="authentication.continueWithGoogle"]')
    expect(googleBtn.exists()).toBe(true)
    expect(googleBtn.text()).toBe('')
  })

  it('renders a Name field alongside email/password', () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(3)
  })

  it('submits the entered name/email/password via registerWithPassword', async () => {
    mockRegisterWithPassword.mockResolvedValue({ ok: true })
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('input[type="text"]').setValue('Mario Rossi')
    await wrapper.find('input[type="email"]').setValue('new@unibo.it')
    await wrapper.find('input[type="password"]').setValue('s3cret!')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockRegisterWithPassword).toHaveBeenCalledWith('new@unibo.it', 's3cret!', 'Mario Rossi')
  })

  it('emits "close" once registration succeeds', async () => {
    mockRegisterWithPassword.mockResolvedValue({ ok: true })
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows the mapped error message and does not close on failure', async () => {
    mockRegisterWithPassword.mockResolvedValue({ ok: false, error: 'emailAlreadyRegistered' })
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('authentication.emailAlreadyRegistered')
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('routes registration straight to Google (kc_idp_hint) when the Google button is clicked', async () => {
    const wrapper = mount(SignInModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const googleBtn = wrapper.find('[aria-label="authentication.continueWithGoogle"]')
    await googleBtn.trigger('click')

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
