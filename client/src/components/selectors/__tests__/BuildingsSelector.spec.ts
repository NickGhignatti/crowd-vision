import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import BuildingsSelector from '../BuildingsSelector.vue'

vi.mock('@/composables/auth/useUserPermissions', () => ({
  useUserPermissions: () => ({
    memberships: { value: [] },
    fetchPermissions: vi.fn(),
    canEdit: vi.fn().mockReturnValue(true),
  }),
}))

describe('BuildingsSelector', () => {
  const buildingModel = {
    id: 'b-1',
    name: 'Main Campus',
    domains: ['unibo.it'],
    rooms: [
      {
        id: 'r1',
        name: 'RoomCard r1',
        capacity: 100,
        position: { x: 0, y: 2, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
      {
        id: 'r2',
        name: 'RoomCard r2',
        capacity: 100,
        position: { x: 1, y: 1, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
      {
        id: 'r3',
        name: 'RoomCard r3',
        capacity: 100,
        position: { x: 2, y: 2, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
    ],
  }

  const createWrapper = (
    buildingOptions = [
      { id: 'b-1', name: 'Main Campus', domains: ['unibo.it'] },
      { id: 'b-2', name: 'Annex', domains: ['unibo.it'] },
    ],
  ) =>
    mount(BuildingsSelector, {
      props: {
        buildingOptions,
        selectedId: 'b-1',
        buildingModel,
        activeFloor: null,
      },
      global: {
        stubs: {
          Transition: false,
        },
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

  it('emits change-building with the building id when a card emits select', async () => {
    const wrapper = createWrapper()

    await wrapper.findAllComponents({ name: 'BuildingCard' })[1]?.vm.$emit('select')

    expect(wrapper.emitted('change-building')?.[0]).toEqual(['b-2'])
  })

  it('groups buildings under a collapsible header per domain', () => {
    const wrapper = createWrapper([
      { id: 'b-1', name: 'Main Campus', domains: ['unibo.it'] },
      { id: 'b-2', name: 'Annex', domains: ['polimi.it'] },
    ])

    const groups = wrapper.findAllComponents({ name: 'DomainBuildingGroup' })
    expect(groups).toHaveLength(2)
    // domains are sorted alphabetically
    expect(groups[0]?.props('name')).toBe('polimi.it')
    expect(groups[1]?.props('name')).toBe('unibo.it')
  })

  it('lists a building under every domain it belongs to', () => {
    const wrapper = createWrapper([
      { id: 'b-1', name: 'Shared', domains: ['unibo.it', 'polimi.it'] },
    ])

    const groups = wrapper.findAllComponents({ name: 'DomainBuildingGroup' })
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.props('count') === 1)).toBe(true)
  })

  it('falls back to the "Other" group for buildings without a domain', () => {
    const wrapper = createWrapper([{ id: 'b-1', name: 'Orphan', domains: [] }])

    const group = wrapper.findComponent({ name: 'DomainBuildingGroup' })
    // vue-i18n is globally mocked to echo the key
    expect(group.props('name')).toBe('model.ungrouped')
  })

  it('collapses and reopens a domain group on header toggle', async () => {
    const wrapper = createWrapper()
    const group = wrapper.findComponent({ name: 'DomainBuildingGroup' })
    expect(group.props('open')).toBe(true)

    await group.vm.$emit('toggle')
    expect(wrapper.findComponent({ name: 'DomainBuildingGroup' }).props('open')).toBe(false)

    await group.vm.$emit('toggle')
    expect(wrapper.findComponent({ name: 'DomainBuildingGroup' }).props('open')).toBe(true)
  })

  it('emits change-floor when building card updates active-floor model', async () => {
    const wrapper = createWrapper()

    await wrapper.findComponent({ name: 'BuildingCard' }).vm.$emit('update:activeFloor', 2)

    expect(wrapper.emitted('change-floor')?.[0]).toEqual([2])
  })

  it('shows reopen button after collapsing and reopens when clicked', async () => {
    const wrapper = createWrapper()

    const collapse = wrapper.find('.ph-caret-left')
    expect(collapse.exists()).toBe(true)

    await collapse.trigger('click')
    await wrapper.vm.$nextTick()

    const reopen = wrapper.find('.ph-caret-right')
    expect(reopen.exists()).toBe(true)

    await reopen.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('aside').classes()).toContain('w-80')
  })
})
