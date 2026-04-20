import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import LeftMenu from '../LeftMenu.vue'

vi.mock('@/composables/useUserPermissions', () => ({
  useUserPermissions: () => ({
    memberships: { value: [] },
    fetchPermissions: vi.fn(),
    canEdit: vi.fn().mockReturnValue(true),
  }),
}))

describe('LeftMenu', () => {
  const buildingModel = {
    id: 'b-1',
    name: 'Main Campus',
    domains: ['unibo.it'],
    rooms: [
      {
        id: 'r1',
        name: 'Room r1',
        capacity: 100,
        position: { x: 0, y: 2, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
      {
        id: 'r2',
        name: 'Room r2',
        capacity: 100,
        position: { x: 1, y: 1, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
      {
        id: 'r3',
        name: 'Room r3',
        capacity: 100,
        position: { x: 2, y: 2, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
    ],
  }

  const createWrapper = () =>
    mount(LeftMenu, {
      props: {
        buildingOptions: [
          { id: 'b-1', name: 'Main Campus' },
          { id: 'b-2', name: 'Annex' },
        ],
        selectedId: 'b-1',
        buildingModel,
        activeFloor: null,
      },
    })

  it('renders left panel title and one building card per building id', () => {
    const wrapper = createWrapper()

    expect(wrapper.text()).toContain('model.data')
    expect(wrapper.findAllComponents({ name: 'BuildingCard' })).toHaveLength(2)
  })

  it('passes sorted unique floors to building cards', () => {
    const wrapper = createWrapper()
    const firstCard = wrapper.findComponent({ name: 'BuildingCard' })

    expect(firstCard.props('availableFloors')).toEqual([1, 2])
  })

  it('emits change-building when a building card emits select', async () => {
    const wrapper = createWrapper()

    await wrapper.findAllComponents({ name: 'BuildingCard' })[1]?.vm.$emit('select')

    expect(wrapper.emitted('change-building')?.[0]).toEqual([1])
  })

  it('emits change-floor when building card updates active-floor model', async () => {
    const wrapper = createWrapper()

    await wrapper.findComponent({ name: 'BuildingCard' }).vm.$emit('update:activeFloor', 2)

    expect(wrapper.emitted('change-floor')?.[0]).toEqual([2])
  })

  it('shows reopen button after collapsing and reopens when clicked', async () => {
    const wrapper = createWrapper()

    // First header button is the collapse control.
    await wrapper.find('.p-1').trigger('click')

    const reopen = wrapper.find('button[title="commons.open"]')
    expect(reopen.exists()).toBe(true)

    await reopen.trigger('click')

    expect(wrapper.find('button[title="commons.open"]').exists()).toBe(false)
  })
})
