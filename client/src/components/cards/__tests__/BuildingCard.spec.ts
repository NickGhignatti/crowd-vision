import { mount, shallowMount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import BuildingCard from '../BuildingCard.vue'
import FloorSelector from '@/components/buttons/FloorSelector.vue'

const defaultProps = {
  buildingId: 'building-1',
  isSelected: false,
  buildingModel: null,
  availableFloors: [],
  showControls: false,
  activeFloor: null,
}

const createWrapper = (props = {}) =>
  shallowMount(BuildingCard, {
    props: { ...defaultProps, ...props },
    global: {
      mocks: { $t: (key: string) => key },
    },
  })

const createFullWrapper = (props = {}) =>
  mount(BuildingCard, {
    props: { ...defaultProps, ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { FloorSelector: true },
    },
  })

const getCard = (wrapper: ReturnType<typeof createWrapper>) => wrapper.find('.rounded-xl')

describe('BuildingCard', () => {
  describe('emits', () => {
    it('emits "select" when card is clicked', async () => {
      const wrapper = createWrapper()

      await getCard(wrapper).trigger('click')

      expect(wrapper.emitted('select')).toHaveLength(1)
    })

    it('emits "toggle-controls" when toggle button is clicked', async () => {
      const wrapper = createWrapper({ isSelected: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('toggle-controls')).toHaveLength(1)
    })

    it('does not emit "select" when toggle button is clicked', async () => {
      const wrapper = createWrapper({ isSelected: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('select')).toBeUndefined()
    })
  })

  describe('v-if rendering', () => {
    it('renders the toggle button only when isSelected is true', () => {
      const wrapper = createWrapper({ isSelected: true })

      expect(wrapper.find('button').exists()).toBe(true)
    })

    it('does not render the toggle button when isSelected is false', () => {
      const wrapper = createWrapper({ isSelected: false })

      expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders FloorSelector when isSelected, showControls, buildingModel and availableFloors are set', () => {
      const wrapper = createFullWrapper({
        isSelected: true,
        showControls: true,
        buildingModel: { id: 'building-1' },
        availableFloors: [1, 2, 3],
      })

      expect(wrapper.findComponent(FloorSelector).exists()).toBe(true)
    })

    it('does not render FloorSelector when showControls is false', () => {
      const wrapper = createWrapper({
        isSelected: true,
        showControls: false,
        buildingModel: { id: 'building-1' },
        availableFloors: [1, 2, 3],
      })

      expect(wrapper.findComponent(FloorSelector).exists()).toBe(false)
    })

    it('does not render FloorSelector when availableFloors is empty', () => {
      const wrapper = createWrapper({
        isSelected: true,
        showControls: true,
        buildingModel: { id: 'building-1' },
        availableFloors: [],
      })

      expect(wrapper.findComponent(FloorSelector).exists()).toBe(false)
    })

    it('does not render FloorSelector when buildingModel is null', () => {
      const wrapper = createWrapper({
        isSelected: true,
        showControls: true,
        buildingModel: null,
        availableFloors: [1, 2, 3],
      })

      expect(wrapper.findComponent(FloorSelector).exists()).toBe(false)
    })
  })
})
