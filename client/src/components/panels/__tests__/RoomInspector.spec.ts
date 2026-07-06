import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomInspector from '@/components/panels/RoomInspector.vue'
import type { Room } from '@/models/building.ts'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1',
  name: 'Room 1',
  capacity: 10,
  color: '#ff0000',
  position: { x: 1, y: 0, z: 2 },
  dimensions: { width: 4, height: 3, depth: 5 },
  ...overrides,
})

describe('RoomInspector', () => {
  it('renders nothing when there is no selected room', () => {
    const wrapper = mount(RoomInspector, { props: { room: null, floorLevels: [0] } })
    expect(wrapper.find('[data-testid="room-inspector"]').exists()).toBe(false)
  })

  it('populates fields from the given room', () => {
    const wrapper = mount(RoomInspector, { props: { room: makeRoom(), floorLevels: [0] } })

    expect(
      (wrapper.find('[data-testid="name-input"]').element as HTMLInputElement).value,
    ).toBe('Room 1')
    expect(
      (wrapper.find('[data-testid="capacity-input"]').element as HTMLInputElement).value,
    ).toBe('10')
    expect(
      (wrapper.find('[data-testid="x-input"]').element as HTMLInputElement).value,
    ).toBe('1')
    expect(
      (wrapper.find('[data-testid="z-input"]').element as HTMLInputElement).value,
    ).toBe('2')
    expect(
      (wrapper.find('[data-testid="width-input"]').element as HTMLInputElement).value,
    ).toBe('4')
    expect(
      (wrapper.find('[data-testid="height-input"]').element as HTMLInputElement).value,
    ).toBe('3')
    expect(
      (wrapper.find('[data-testid="depth-input"]').element as HTMLInputElement).value,
    ).toBe('5')
  })

  it('commits a name change on blur/change', async () => {
    const wrapper = mount(RoomInspector, { props: { room: makeRoom(), floorLevels: [0] } })
    const input = wrapper.find('[data-testid="name-input"]')

    await input.setValue('New Name')
    await input.trigger('change')

    expect(wrapper.emitted('commit')?.[0]).toEqual([{ name: 'New Name' }])
  })

  it('commits capacity, color, x, z, width, height and depth as their own patches', async () => {
    const wrapper = mount(RoomInspector, { props: { room: makeRoom(), floorLevels: [0] } })

    await wrapper.find('[data-testid="capacity-input"]').setValue(25)
    await wrapper.find('[data-testid="capacity-input"]').trigger('change')
    await wrapper.find('[data-testid="x-input"]').setValue(9)
    await wrapper.find('[data-testid="x-input"]').trigger('change')
    await wrapper.find('[data-testid="width-input"]').setValue(7)
    await wrapper.find('[data-testid="width-input"]').trigger('change')

    const commits = wrapper.emitted('commit') ?? []
    expect(commits).toContainEqual([{ capacity: 25 }])
    expect(commits).toContainEqual([{ position: { x: 9 } }])
    expect(commits).toContainEqual([{ dimensions: { width: 7 } }])
  })

  it('shows the floor (Y) select with existing floor levels as options', () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 3, z: 0 } }), floorLevels: [0, 3, 6] },
    })

    const select = wrapper.find('[data-testid="y-select"]')
    const values = select.findAll('option').map((o) => o.element.value)
    expect(values).toEqual(['0', '3', '6', 'custom'])
    expect((select.element as HTMLSelectElement).value).toBe('3')
  })

  it('commits the picked floor level when the Y select changes', async () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 0, z: 0 } }), floorLevels: [0, 3] },
    })

    await wrapper.find('[data-testid="y-select"]').setValue('3')

    expect(wrapper.emitted('commit')?.[0]).toEqual([{ position: { y: 3 } }])
  })

  it('reveals a custom Y input when "custom" is selected and commits on change', async () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 0, z: 0 } }), floorLevels: [0, 3] },
    })

    await wrapper.find('[data-testid="y-select"]').setValue('custom')
    expect(wrapper.find('[data-testid="y-custom-input"]').exists()).toBe(true)

    const customInput = wrapper.find('[data-testid="y-custom-input"]')
    await customInput.setValue(12)
    await customInput.trigger('change')

    const commits = wrapper.emitted('commit') ?? []
    expect(commits[commits.length - 1]).toEqual([{ position: { y: 12 } }])
  })

  it('pre-selects "custom" when the room is already on a non-standard floor', () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 1.5, z: 0 } }), floorLevels: [0, 3] },
    })

    expect((wrapper.find('[data-testid="y-select"]').element as HTMLSelectElement).value).toBe(
      'custom',
    )
    expect(
      (wrapper.find('[data-testid="y-custom-input"]').element as HTMLInputElement).value,
    ).toBe('1.5')
  })

  it('resyncs fields when a different room is selected', async () => {
    const wrapper = mount(RoomInspector, { props: { room: makeRoom(), floorLevels: [0] } })

    await wrapper.setProps({ room: makeRoom({ id: 'r2', name: 'Room 2', capacity: 99 }) })

    expect(
      (wrapper.find('[data-testid="name-input"]').element as HTMLInputElement).value,
    ).toBe('Room 2')
    expect(
      (wrapper.find('[data-testid="capacity-input"]').element as HTMLInputElement).value,
    ).toBe('99')
  })
})
