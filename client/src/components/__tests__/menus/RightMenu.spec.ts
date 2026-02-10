import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RightMenu from '@/components/menus/RightMenu.vue'

describe('RightMenu.vue', () => {
  const mockBuilding = {
    id: 'B1',
    domains: [''],
    rooms: [
      {
        id: 'R101',
        capacity: 10,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 1, height: 1, depth: 1 },
      },
      {
        id: 'R102',
        capacity: 20,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 1, height: 1, depth: 1 },
      },
    ],
  }

  it('filters rooms based on search', async () => {
    const wrapper = mount(RightMenu, {
      props: { building: mockBuilding, selectedRoomId: null },
    })

    // Open Search
    await wrapper.find(`button[title = "${('model.searchRoom')}"]`).trigger('click')

    // Type in search box
    const input = wrapper.find('input')
    await input.setValue('R102')

    expect(wrapper.text()).toContain('R102')
    expect(wrapper.text()).not.toContain('R101')
  })

  it('emits toggle-select when a room is clicked', async () => {
    const wrapper = mount(RightMenu, {
      props: { building: mockBuilding, selectedRoomId: null },
    })

    const roomItems = wrapper.findAllComponents({ name: 'RoomItem' })
    await roomItems[0].trigger('click')

    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['R101'])
  })
})
