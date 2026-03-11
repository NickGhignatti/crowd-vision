import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import StepOne from '../../components/StepOne.vue'

const defaultProps = {
  mainDomain: '',
  authStrategy: 'internal' as const,
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
}

const createWrapper = (props = {}) =>
  mount(StepOne, {
    props: { ...defaultProps, ...props },
    global: { mocks: { $t: (key: string) => key } },
  })

describe('Step One', () => {
  describe('1. Emits', () => {
    it('emits "update-main-domain" when main domain input changes', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input[type="text"]').setValue('unibo.it')

      expect(wrapper.emitted('update-main-domain')?.[0]).toEqual(['unibo.it'])
    })

    it('emits "next" when Enter is pressed on main domain input', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input[type="text"]').trigger('keydown.enter')

      expect(wrapper.emitted('next')).toHaveLength(1)
    })

    it('emits "update-auth-strategy" with "internal" when internal radio is selected', async () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      await wrapper.find('input[type="radio"]').trigger('change')

      expect(wrapper.emitted('update-auth-strategy')?.[0]).toEqual(['internal'])
    })

    it('emits "update-auth-strategy" with "oidc" when oidc radio is selected', async () => {
      const wrapper = createWrapper()

      await wrapper.findAll('input[type="radio"]')[1].trigger('change')

      expect(wrapper.emitted('update-auth-strategy')?.[0]).toEqual(['oidc'])
    })

    it('emits "update-issuer-url" when issuer url input changes', async () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      await wrapper
        .find('input[placeholder="https://idp.example.com"]')
        .setValue('https://idp.unibo.it')

      expect(wrapper.emitted('update-issuer-url')?.[0]).toEqual(['https://idp.unibo.it'])
    })

    it('emits "update-client-id" when client id input changes', async () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      const inputs = wrapper.findAll('input[type="text"]')
      await inputs[inputs.length - 1].setValue('my-client-id')

      expect(wrapper.emitted('update-client-id')?.[0]).toEqual(['my-client-id'])
    })

    it('emits "update-client-secret" when client secret input changes', async () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      await wrapper.find('input[type="password"]').setValue('my-secret')

      expect(wrapper.emitted('update-client-secret')?.[0]).toEqual(['my-secret'])
    })
  })

  describe('2. Rendering', () => {
    it('does not render OIDC fields when authStrategy is "internal"', () => {
      const wrapper = createWrapper({ authStrategy: 'internal' })

      expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    })

    it('renders OIDC fields when authStrategy is "oidc"', () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    })
  })
})
