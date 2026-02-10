import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomItem from '@/components/menus/components/RoomItem.vue'

describe('RoomItem.vue', () => {
  const mockRoom = {
    id: 'Office-101',
    capacity: 5,
    position: { x: 0, y: 0, z: 0 },
    dimensions: { width: 10, height: 4, depth: 10 },
    color: '#FF5733',
  }

  it('renders room details correctly', () => {
    const wrapper = mount(RoomItem, {
      props: {
        room: mockRoom,
        isSelected: false,
      },
    })

    // Check ID display
    expect(wrapper.text()).toContain('Office-101')

    // Check Capacity display (1 / 5)
    expect(wrapper.text()).toContain('5')

    // Check Color indicator
    const colorDot = wrapper.find('.rounded-full.shadow-sm')
    expect(colorDot.attributes('style')).toContain('background-color: #FF5733') // rgb(255, 87, 51)
  })

  it('emits select event when clicking the card', async () => {
    const wrapper = mount(RoomItem, {
      props: {
        room: mockRoom,
        isSelected: false,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['Office-101'])
  })

  it('applies selected styles when isSelected is true', () => {
    const wrapper = mount(RoomItem, {
      props: {
        room: mockRoom,
        isSelected: true,
      },
    })

    // It should have the green border and ring
    expect(wrapper.classes()).toContain('border-emerald-600')
    expect(wrapper.classes()).toContain('ring-emerald-600')

    // It should NOT have the hover border
    expect(wrapper.classes()).not.toContain('hover:border-emerald-200')
  })

  it('shows edit button only when canEdit is true', () => {
    const wrapper = mount(RoomItem, {
      props: {
        room: mockRoom,
        isSelected: false,
        canEdit: true,
      },
    })

    expect(wrapper.find(`button[title="${('model.rooms.editRoom.title')}"]`).exists()).toBe(true)
  })

  it('emits edit event and stops propagation when edit button is clicked', async () => {
    const wrapper = mount(RoomItem, {
      props: {
        room: mockRoom,
        isSelected: false,
        canEdit: true,
      },
    })

    const editBtn = wrapper.find(`button[title="${('model.rooms.editRoom.title')}"]`)
    await editBtn.trigger('click')

    // 1. Should emit 'edit'
    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')?.[0]).toEqual([mockRoom])

    // 2. Should NOT emit 'select' (because of @click.stop)
    expect(wrapper.emitted('select')).toBeFalsy()
  })
})
