import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import EditBuildingModal from '../../editing/EditBuildingModal.vue'
import type { Building } from '@/models/building'

const mockBuilding: Building = {
  id: 'building-1',
  name: 'Main Campus',
  maxTemperature: 30,
  rooms: [],
  domains: [],
}

const mountComponent = (props: { isOpen: boolean; building: Building | null }) => {
  return mount(EditBuildingModal, {
    props,
    global: {
      mocks: { t: (key: string) => key },
      stubs: { StandardInput: { template: '<div><slot /></div>' } },
    },
  })
}

describe('EditBuildingModal', () => {
  describe('props', () => {
    it('renders the modal when isOpen is true', () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      expect(wrapper.find('[class*="fixed"]').exists()).toBe(true)
    })

    it('does not render the modal when isOpen is false', () => {
      const wrapper = mountComponent({ isOpen: false, building: mockBuilding })

      expect(wrapper.find('[class*="fixed"]').exists()).toBe(false)
    })
  })

  describe('form initialization', () => {
    it('populates form with building name and maxTemperature', () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      const inputs = wrapper.findAll('input')
      expect(inputs[0]!.element.value).toBe('Main Campus')
      expect(inputs[1]!.element.value).toBe('30')
    })

    it('falls back to building id when name is not provided', () => {
      const wrapper = mountComponent({
        isOpen: true,
        building: { ...mockBuilding, name: '' },
      })

      const nameInput = wrapper.findAll('input')[0]!
      expect(nameInput.element.value).toBe('building-1')
    })

    it('falls back to 27 when maxTemperature is not provided', () => {
      const wrapper = mountComponent({
        isOpen: true,
        building: { ...mockBuilding, maxTemperature: undefined },
      })

      const tempInput = wrapper.findAll('input')[1]!
      expect(tempInput.element.value).toBe('27')
    })

    it('repopulates the form when building prop changes', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      await wrapper.setProps({
        building: { id: 'b-2', name: 'New BuildingCard', maxTemperature: 22, rooms: [], domains: [] },
      })

      const inputs = wrapper.findAll('input')
      expect(inputs[0]!.element.value).toBe('New BuildingCard')
      expect(inputs[1]!.element.value).toBe('22')
    })
  })

  describe('emits', () => {
    it('emits "close" when the backdrop is clicked', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      await wrapper.find('.absolute.inset-0').trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('emits "close" when the X button is clicked', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      await wrapper.find('.ph-x').trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('emits "close" when the Cancel button is clicked', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      const cancelButton = wrapper
        .findAll('button')
        .find((b) => b.text().includes('commons.cancel'))!
      await cancelButton.trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('emits "save" with updated form data when Save is clicked', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      await wrapper.findAll('input')[0]!.setValue('Updated Name')
      await wrapper.findAll('input')[1]!.setValue(25)

      const saveButton = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))!
      await saveButton.trigger('click')

      expect(wrapper.emitted('save')).toBeTruthy()
      expect(wrapper.emitted('save')![0]).toEqual([{ name: 'Updated Name', maxTemperature: 25 }])
    })

    it('emits "close" alongside "save" when Save is clicked', async () => {
      const wrapper = mountComponent({ isOpen: true, building: mockBuilding })

      const saveButton = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))!
      await saveButton.trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
      expect(wrapper.emitted('save')).toBeTruthy()
    })

    it('does not emit "save" when building is null', async () => {
      const wrapper = mountComponent({ isOpen: true, building: null })

      const saveButton = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))!
      await saveButton.trigger('click')

      expect(wrapper.emitted('save')).toBeFalsy()
    })
  })
})
