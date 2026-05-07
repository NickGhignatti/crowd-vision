import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import LongSearchInput from '../../search/LongSearchInput.vue'

describe('LongSearchInput', () => {
  describe('props', () => {
    it('renders the placeholder when provided', () => {
      const wrapper = mount(LongSearchInput, {
        props: { placeholder: 'Search domains...' },
      })

      expect(wrapper.find('input').attributes('placeholder')).toBe('Search domains...')
    })

    it('renders no placeholder when not provided', () => {
      const wrapper = mount(LongSearchInput)

      expect(wrapper.find('input').attributes('placeholder')).toBeUndefined()
    })
  })

  describe('v-model', () => {
    it('renders with the initial modelValue', () => {
      const wrapper = mount(LongSearchInput, {
        props: { modelValue: 'hello', 'onUpdate:modelValue': () => {} },
      })

      expect(wrapper.find('input').element.value).toBe('hello')
    })

    it('emits update:modelValue when the user types', async () => {
      const wrapper = mount(LongSearchInput, {
        props: { modelValue: '', 'onUpdate:modelValue': () => {} },
      })

      await wrapper.find('input').setValue('vue')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['vue'])
    })
  })

  describe('rendering', () => {
    it('renders the search icon', () => {
      const wrapper = mount(LongSearchInput)

      expect(wrapper.find('i.ph-magnifying-glass').exists()).toBe(true)
    })

    it('renders an input of type text', () => {
      const wrapper = mount(LongSearchInput)

      expect(wrapper.find('input').attributes('type')).toBe('text')
    })
  })
})
