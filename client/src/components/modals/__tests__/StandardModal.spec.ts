import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import StandardModal from '../StandardModal.vue'

const createWrapper = (props = {}, slot = '<div class="slot-content">Content</div>') =>
  mount(StandardModal, {
    props: { isOpen: true, ...props },
    slots: { default: slot },
    global: { stubs: { Teleport: true, Transition: false } },
  })

describe('StandardModal', () => {
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

  describe('size', () => {
    it('defaults to the narrow (sm) panel width', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.max-w-sm').exists()).toBe(true)
    })

    it('renders a wider panel when size="lg"', () => {
      const wrapper = createWrapper({ size: 'lg' })

      expect(wrapper.find('.max-w-2xl').exists()).toBe(true)
      expect(wrapper.find('.max-w-sm').exists()).toBe(false)
    })
  })
})
