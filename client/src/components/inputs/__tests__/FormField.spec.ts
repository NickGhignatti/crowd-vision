import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import FormField from '../FormField.vue'

const createWrapper = (props = {}, slot = '<input />') =>
  mount(FormField, {
    props: { label: 'Email', icon: 'ph-envelope', ...props },
    slots: { default: slot },
  })

describe('FormField', () => {
  describe('1. Rendering', () => {
    it('renders the label correctly', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('label').text()).toBe('Email')
    })

    it('renders the slot content', () => {
      const wrapper = createWrapper({}, '<input type="email" />')

      expect(wrapper.find('input').exists()).toBe(true)
    })

    it('applies the icon class to the icon element', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('i').classes()).toContain('ph-envelope')
    })
  })

  describe('2. IconFocusClass', () => {
    it('applies the default focus class when iconFocusClass is not provided', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('i').classes()).toContain('group-focus-within:text-emerald-500')
    })

    it('applies a custom focus class when iconFocusClass is provided', () => {
      const wrapper = createWrapper({ iconFocusClass: 'group-focus-within:text-blue-500' })

      expect(wrapper.find('i').classes()).toContain('group-focus-within:text-blue-500')
    })

    it('does not apply the default focus class when iconFocusClass is provided', () => {
      const wrapper = createWrapper({ iconFocusClass: 'group-focus-within:text-blue-500' })

      expect(wrapper.find('i').classes()).not.toContain('group-focus-within:text-emerald-500')
    })
  })
})
