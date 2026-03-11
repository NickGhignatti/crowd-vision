import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import AddDomain from '../AddDomain.vue'

vi.mock('../components/StepOne.vue', () => ({
  default: {
    name: 'StepOne',
    template: '<div />',
    props: ['mainDomain', 'authStrategy', 'issuerUrl', 'clientId', 'clientSecret'],
    emits: [
      'update-main-domain',
      'update-auth-strategy',
      'update-issuer-url',
      'update-client-id',
      'update-client-secret',
      'next',
    ],
  },
}))

vi.mock('../components/StepTwo.vue', () => ({
  default: {
    name: 'StepTwo',
    template: '<div />',
    props: ['mainDomain', 'authStrategy', 'subDomains', 'error'],
    emits: ['add-subdomain', 'remove-subdomain', 'set-error', 'clear-error', 'edit-main'],
  },
}))

const createWrapper = (props = {}) =>
  mount(AddDomain, {
    props: { isOpen: true, ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Teleport: true, Transition: false },
    },
  })

describe('AddDomain', () => {
  describe('1. Rendering', () => {
    it('renders the modal when isOpen is true', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.bg-white').exists()).toBe(true)
    })

    it('does not render the modal when isOpen is false', () => {
      const wrapper = createWrapper({ isOpen: false })

      expect(wrapper.find('.bg-white').exists()).toBe(false)
    })

    it('renders StepOne on initial load', () => {
      const wrapper = createWrapper()

      expect(wrapper.findComponent({ name: 'StepOne' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'StepTwo' }).exists()).toBe(false)
    })

    it('renders the error message when error is set', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')

      expect(wrapper.find('.text-red-600').exists()).toBe(true)
    })
  })

  describe('2. Navigation', () => {
    it('moves to step 2 when nextStep is called with a valid domain', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')

      expect(wrapper.findComponent({ name: 'StepTwo' }).exists()).toBe(true)
    })

    it('stays on step 1 when nextStep is called with invalid domain', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')

      expect(wrapper.findComponent({ name: 'StepOne' }).exists()).toBe(true)
    })

    it('goes back to step 1 when back button is clicked on step 2', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')
      await wrapper.find('button.text-slate-500').trigger('click')

      expect(wrapper.findComponent({ name: 'StepOne' }).exists()).toBe(true)
    })

    it('goes back to step 1 when StepTwo emits "edit-main"', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')
      await wrapper.findComponent({ name: 'StepTwo' }).vm.$emit('edit-main')

      expect(wrapper.findComponent({ name: 'StepOne' }).exists()).toBe(true)
    })
  })

  describe('3. Emits', () => {
    it('emits "close" when close button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button.text-slate-400').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits "close" when cancel button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper
        .findAll('button')
        .find((b) => b.text().includes('cancel'))
        ?.trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits "add" with correct payload on submit', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('next')
      await wrapper.findComponent({ name: 'StepTwo' }).vm.$emit('add-subdomain', 'cs.unibo.it')
      await wrapper
        .findAll('button')
        .find((b) => b.text().includes('create'))
        ?.trigger('click')

      expect(wrapper.emitted('add')?.[0]).toEqual([
        {
          name: 'unibo.it',
          subdomains: ['cs.unibo.it'],
          authStrategy: 'internal',
        },
      ])
    })

    it('resets form state after close', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.find('button.text-slate-400').trigger('click')
      await wrapper.setProps({ isOpen: true })

      expect(wrapper.findComponent({ name: 'StepOne' }).exists()).toBe(true)
    })
  })

  describe('4. isValidMain', () => {
    it('disables the next button when domain is empty', () => {
      const wrapper = createWrapper()

      const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('continue'))
      expect(nextBtn?.attributes('disabled')).toBeDefined()
    })

    it('enables the next button when domain is valid', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'StepOne' }).vm.$emit('update-main-domain', 'unibo.it')

      const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('continue'))
      expect(nextBtn?.attributes('disabled')).toBeUndefined()
    })
  })
})
