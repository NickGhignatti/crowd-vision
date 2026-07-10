import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DomainInput from '../DomainInput.vue'

const defaultProps = {
  mainDomain: '',
  isVisibleFromOutside: false,
}

const createWrapper = (props = {}) =>
  mount(DomainInput, {
    props: { ...defaultProps, ...props },
    global: { mocks: { $t: (key: string) => key } },
  })

describe('DomainInput Component', () => {
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

    it('emits "update-selected-master-domain" when the master domain select changes', async () => {
      const wrapper = createWrapper({ masterDomainChoices: ['acme.com', 'globex.com'] })

      await wrapper.find('select').setValue('acme.com')

      expect(wrapper.emitted('update-selected-master-domain')?.[0]).toEqual(['acme.com'])
    })

    it('emits "update-is-visible-from-outside" when the visibility toggle is clicked', async () => {
      const wrapper = createWrapper({ isVisibleFromOutside: false })

      await wrapper.find('button[role="switch"]').trigger('click')

      expect(wrapper.emitted('update-is-visible-from-outside')?.[0]).toEqual([true])
    })
  })

  describe('2. Rendering', () => {
    it('does not render a master domain select when no choices are provided', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('select').exists()).toBe(false)
    })

    it('renders a master domain select when choices are provided', () => {
      const wrapper = createWrapper({ masterDomainChoices: ['acme.com'] })

      expect(wrapper.find('select').exists()).toBe(true)
    })
  })
})
