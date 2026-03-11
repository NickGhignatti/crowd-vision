import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import BaseModal from '../BaseModal.vue'

const createWrapper = (props = {}, slot = '<div class="slot-content">Content</div>') =>
  mount(BaseModal, {
    props: { isOpen: true, ...props },
    slots: { default: slot },
    global: { stubs: { Teleport: true, Transition: false } },
  })

describe('BaseModal', () => {
  describe('rendering', () => {
    it('renders the modal when isOpen is true', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.fixed').exists()).toBe(true)
    })

    it('does not render the modal when isOpen is false', () => {
      const wrapper = createWrapper({ isOpen: false })

      expect(wrapper.find('.fixed').exists()).toBe(false)
    })

    it('renders slot content', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.slot-content').exists()).toBe(true)
    })
  })

  describe('emits', () => {
    it('emits "close" when backdrop is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('.absolute.inset-0').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits "close" when close button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('does not emit "close" when modal content is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('.relative.w-full').trigger('click')

      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })
})
