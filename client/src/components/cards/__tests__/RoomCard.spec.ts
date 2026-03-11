import { shallowMount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import RoomCard from '../RoomCard.vue'
import type { RoomPayload } from '@/models/building.ts'

const mockRoom: { id: string; capacity: number; color: string } = {
  id: 'room-1',
  capacity: 10,
  color: '#ff0000',
}

const createWrapper = (props = {}) =>
  shallowMount(RoomCard, {
    props: {
      room: mockRoom as RoomPayload,
      isSelected: false,
      ...props,
    },
    global: {
      mocks: { $t: (key: string) => key },
    },
  })

describe('RoomCard', () => {
  describe('1. Emits', () => {
    it('emits "select" with room id when card is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('div').trigger('click')

      expect(wrapper.emitted('select')?.[0]).toEqual(['room-1'])
    })

    it('emits "edit" with room payload when edit button is clicked', async () => {
      const wrapper = createWrapper({ canEdit: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('edit')?.[0]).toEqual([mockRoom])
    })

    it('does not emit "select" when edit button is clicked', async () => {
      const wrapper = createWrapper({ canEdit: true })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('select')).toBeUndefined()
    })
  })

  describe('2. Temperature color', () => {
    // TODO : update this tests when temperature will be no more hardcoded
    it('applies emerald color for normal temperature (22°C)', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.text-emerald-600.font-bold').exists()).toBe(true)
    })
  })

  describe('3. Rendering', () => {
    it('renders the selected indicator bar when isSelected is true', () => {
      const wrapper = createWrapper({ isSelected: true })

      expect(wrapper.find('.bg-emerald-600.absolute').exists()).toBe(true)
    })

    it('does not render the selected indicator bar when isSelected is false', () => {
      const wrapper = createWrapper({ isSelected: false })

      expect(wrapper.find('.bg-emerald-600.absolute').exists()).toBe(false)
    })

    it('renders the edit button when canEdit is true', () => {
      const wrapper = createWrapper({ canEdit: true })

      expect(wrapper.find('button').exists()).toBe(true)
    })

    it('does not render the edit button when canEdit is false or undefined', () => {
      const wrapper = createWrapper({ canEdit: false })

      expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders the color dot when room.color is set', () => {
      const wrapper = createWrapper()

      const dot = wrapper.find('span[style]')
      expect(dot.exists()).toBe(true)
      expect(dot.attributes('style')).toContain('#ff0000')
    })

    it('does not render the color dot when room.color is absent', () => {
      const wrapper = createWrapper({ room: { ...mockRoom, color: undefined } })

      expect(wrapper.find('span[style]').exists()).toBe(false)
    })
  })
})
