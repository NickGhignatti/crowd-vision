import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomCard from '@/components/cards/RoomCard.vue'
import type { Room } from '@/models/building'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const makeRoom = (overrides: Partial<Room> = {}): Room =>
  ({
    id: 'room-101',
    capacity: 50,
    maxTemperature: 25,
    color: '#3b82f6',
    ...overrides,
  }) as unknown as Room

describe('RoomCard.vue', () => {
  describe('rendering', () => {
    it('displays the room ID and capacity correctly', () => {
      const room = makeRoom({ id: 'conference-a', capacity: 12 })
      const wrapper = mount(RoomCard, {
        props: { room, isSelected: false, temp: 22, people: 1 },
      })

      expect(wrapper.text()).toContain('#conference-a')
      expect(wrapper.text()).toContain('1 / 12')
    })

    it('renders the color indicator when room.color is provided', () => {
      const room = makeRoom({ color: '#ff0000' })
      const wrapper = mount(RoomCard, {
        props: { room, isSelected: false, temp: 22, people: 1 },
      })

      const colorDot = wrapper.find('span[style="background-color: #ff0000;"]')
      expect(colorDot.exists()).toBe(true)
    })

    it('does not render the color indicator when room.color is missing', () => {
      const room = makeRoom({ color: undefined } as unknown as Partial<Room>)
      const wrapper = mount(RoomCard, {
        props: { room, isSelected: false, temp: 22, people: 1 },
      })

      const colorDot = wrapper.find('span[style]')
      expect(colorDot.exists()).toBe(false)
    })

    it('renders structural selection indicators when isSelected is true', () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom(), isSelected: true, temp: 22, people: 1 },
      })

      expect(wrapper.find('.absolute.bg-emerald-600').exists()).toBe(true)
    })

    it('hides structural selection indicators when isSelected is false', () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom(), isSelected: false, temp: 22, people: 1 },
      })

      expect(wrapper.find('.absolute.bg-emerald-600').exists()).toBe(false)
    })
  })

  describe('editing permissions', () => {
    it('does not render the edit button if canEdit is false or omitted', () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom(), isSelected: false, temp: 22, people: 1 }, // canEdit omitted
      })

      expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders the edit button if canEdit is true', () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom(), isSelected: false, canEdit: true, temp: 22, people: 1 },
      })

      expect(wrapper.find('button').exists()).toBe(true)
      expect(wrapper.find('button').attributes('title')).toBe('model.rooms.editRoom.title')
    })
  })

  describe('interactions and event emitting', () => {
    it('emits "select" with the room ID when the card is clicked', async () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom({ id: 'office-2' }), isSelected: false, temp: 22, people: 1 },
      })

      await wrapper.trigger('click')

      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')?.[0]).toEqual(['office-2'])
    })

    it('emits "edit" with the room object when the edit button is clicked', async () => {
      const room = makeRoom({ id: 'office-2' })
      const wrapper = mount(RoomCard, {
        props: { room, isSelected: false, canEdit: true, temp: 22, people: 1 },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('edit')).toBeTruthy()
      expect(wrapper.emitted('edit')?.[0]).toEqual([room])
    })

    it('prevents the "select" event from firing when the edit button is clicked', async () => {
      const wrapper = mount(RoomCard, {
        props: { room: makeRoom(), isSelected: false, canEdit: true, temp: 22, people: 1 },
      })

      await wrapper.find('button').trigger('click')

      // Because of the @click.stop modifier, the event shouldn't bubble up to the card
      expect(wrapper.emitted('select')).toBeUndefined()
    })
  })
})
