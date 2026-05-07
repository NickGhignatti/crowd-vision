import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ShortSearchInput from '../../search/ShortSearchInput.vue'

const createWrapper = () =>
  mount(ShortSearchInput, {
    props: { modelValue: '' },
    global: {
      mocks: { $t: (key: string) => key },
    },
  })

describe('ShortSearchInput', () => {
  describe('1. Rendering', () => {
    it('renders the search button when closed', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('button').exists()).toBe(true)
      expect(wrapper.find('input').exists()).toBe(false)
    })

    it('renders the input when open', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button').trigger('click')

      expect(wrapper.find('input').exists()).toBe(true)
    })
  })

  describe('2. Toggle', () => {
    it('opens when search button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button').trigger('click')

      expect(wrapper.vm.isOpen).toBe(true)
    })

    it('closes when close button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button').trigger('click')
      await wrapper.find('button').trigger('click')

      expect(wrapper.vm.isOpen).toBe(false)
    })

    it('clears the model when opened', async () => {
      const wrapper = mount(ShortSearchInput, {
        props: {
          modelValue: 'hello',
          'onUpdate:modelValue': (val: string) => wrapper.setProps({ modelValue: val }),
        },
        global: { mocks: { $t: (key: string) => key } },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.props('modelValue')).toBe('')
    })

    it('clears the model when closed', async () => {
      const wrapper = mount(ShortSearchInput, {
        props: {
          modelValue: '',
          'onUpdate:modelValue': (val: string) => wrapper.setProps({ modelValue: val }),
        },
        global: { mocks: { $t: (key: string) => key } },
      })

      await wrapper.find('button').trigger('click') // open
      await wrapper.find('button').trigger('click') // close

      expect(wrapper.props('modelValue')).toBe('')
    })
  })
})
