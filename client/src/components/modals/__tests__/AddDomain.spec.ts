import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import AddDomain from '../AddDomain.vue'

// Keep tests focused on AddDomain state transitions by stubbing wizard steps.
vi.mock('../components/DomainInput.vue', () => ({
  default: {
    name: 'DomainInput',
    template: '<div />',
    props: [
      'mainDomain',
      'authStrategy',
      'issuerUrl',
      'clientId',
      'clientSecret',
      'isVisibleFromOutside',
    ],
    emits: [
      'update-main-domain',
      'update-auth-strategy',
      'update-issuer-url',
      'update-client-id',
      'update-client-secret',
      'update-is-visible-from-outside',
      'next',
    ],
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

    it('renders DomainInput on initial load', () => {
      const wrapper = createWrapper()

      expect(wrapper.findComponent({ name: 'DomainInput' }).exists()).toBe(true)
    })

    it('renders the error message when error is set', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'DomainInput' }).vm.$emit('next')

      expect(wrapper.find('.text-red-600').exists()).toBe(true)
    })
  })

  describe('2. Navigation', () => {
    it('stays on step 1 when nextStep is called with invalid domain', async () => {
      const wrapper = createWrapper()

      await wrapper.findComponent({ name: 'DomainInput' }).vm.$emit('next')

      expect(wrapper.findComponent({ name: 'DomainInput' }).exists()).toBe(true)
    })

    it('goes back to step 1 when back button is clicked on step 2', async () => {
      const wrapper = createWrapper()

      await wrapper
        .findComponent({ name: 'DomainInput' })
        .vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'DomainInput' }).vm.$emit('next')
      await wrapper.find('button.text-slate-500').trigger('click')

      expect(wrapper.findComponent({ name: 'DomainInput' }).exists()).toBe(true)
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

      await wrapper
        .findComponent({ name: 'DomainInput' })
        .vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.findComponent({ name: 'DomainInput' }).vm.$emit('next')
      await wrapper.vm.$nextTick()
      await wrapper
        .findAll('button')
        .find((b) => b.text().includes('create'))
        ?.trigger('click')

      expect(wrapper.emitted('add')?.[0]).toEqual([
        {
          name: 'unibo.it',
          subdomains: [],
          authStrategy: 'internal',
          isVisibleFromOutside: false,
        },
      ])
    })

    it('resets form state after close', async () => {
      const wrapper = createWrapper()

      await wrapper
        .findComponent({ name: 'DomainInput' })
        .vm.$emit('update-main-domain', 'unibo.it')
      await wrapper.find('button.text-slate-400').trigger('click')
      await wrapper.setProps({ isOpen: true })

      expect(wrapper.findComponent({ name: 'DomainInput' }).exists()).toBe(true)
    })
  })
})
