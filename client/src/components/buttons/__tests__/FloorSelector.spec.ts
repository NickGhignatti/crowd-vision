import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FloorSelector from '../FloorSelector.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'model.controls.floorSelection': 'Floor Selection',
        'model.controls.floor': 'Floor',
      }
      return translations[key] ?? key
    },
  }),
}))

const floors = [0, 3, 6, 9]

describe('FloorSelector', () => {
  describe('Rendering', () => {
    it('renders the label', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors },
      })

      expect(wrapper.find('label').text()).toBe('Floor Selection')
    })

    it('always renders the All Floors option', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors },
      })

      const firstOption = wrapper.find('option')
      expect(firstOption.text()).toBe('All Floors')
      expect(firstOption.attributes('value')).toBeUndefined()
    })

    it('renders one option per floor plus the All Floors option', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors },
      })

      // 4 floors + 1 "All Floors"
      expect(wrapper.findAll('option')).toHaveLength(floors.length + 1)
    })

    it('renders each floor with its index and height', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: [0, 3, 6] },
      })

      const options = wrapper.findAll('option').slice(1) // skip "All Floors"

      expect(options[0]?.text()).toBe('Floor 0 (0m)')
      expect(options[1]?.text()).toBe('Floor 1 (3m)')
      expect(options[2]?.text()).toBe('Floor 2 (6m)')
    })

    it('renders the caret icon', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors },
      })

      expect(wrapper.find('i.ph-caret-down').exists()).toBe(true)
    })

    it('renders correctly with no floors', () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: [] },
      })

      // Only the "All Floors" option should exist
      expect(wrapper.findAll('option')).toHaveLength(1)
    })
  })

  describe('V-model', () => {
    it('selects All Floors when modelValue is null', () => {
      const wrapper = mount(FloorSelector, {
        props: {
          availableFloors: floors,
          modelValue: null,
        },
      })

      const select = wrapper.find('select').element as HTMLSelectElement
      expect(select.value).toBe('All Floors')
    })

    it('reflects the correct floor when modelValue is set', () => {
      const wrapper = mount(FloorSelector, {
        props: {
          availableFloors: floors,
          modelValue: 6,
        },
      })

      const select = wrapper.find('select').element as HTMLSelectElement
      expect(select.value).toBe('6')
    })

    it('emits update:modelValue with the selected floor when changed', async () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors, modelValue: null },
      })

      await wrapper.find('select').setValue('3')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([3])
    })

    it('emits update:modelValue with null when All Floors is selected', async () => {
      const wrapper = mount(FloorSelector, {
        props: { availableFloors: floors, modelValue: 3 },
      })

      await wrapper.find('select').setValue('')
      expect(wrapper.emitted('update:modelValue')![0]).toStrictEqual([undefined])
    })
  })
})
