import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
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

  it('shows the floor select with plan-index labels, value = raw Y, plus a "new floor" option', () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 3, z: 0 } }), floorLevels: [0, 3, 6] },
    })

    const select = wrapper.find('[data-testid="floor-select"]')
    // Values stay the underlying Y so the parent's setFloor/updateRoomFields
    // don't need translation; the "new" option creates a floor above.
    const values = select.findAll('option').map((o) => o.element.value)
    expect(values).toEqual(['0', '3', '6', 'new'])
    // Labels are plan indices, not heights.
    const labels = select.findAll('option').map((o) => o.text())
    expect(labels[0]).toContain('0')
    expect(labels[0]?.trim()).not.toBe('0')
    expect(labels[1]).toContain('1')
    expect(labels[2]).toContain('2')
    // The room at y=3 is the 2nd floor (index 1) — the select's value is its raw Y.
    expect((select.element as HTMLSelectElement).value).toBe('3')
  })

  it('commits the picked floor Y when the floor select changes', async () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 0, z: 0 } }), floorLevels: [0, 3] },
    })

    await wrapper.find('[data-testid="floor-select"]').setValue('3')

    expect(wrapper.emitted('commit')?.[0]).toEqual([{ position: { y: 3 } }])
  })

  it('commits a new floor stacked above the top floor when "new floor" is picked', async () => {
    // top floor is y=3, room height is 3, so a new floor stacks at y = 3 + 3 = 6
    const wrapper = mount(RoomInspector, {
      props: {
        room: makeRoom({ position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 5 } }),
        floorLevels: [0, 3],
      },
    })

    await wrapper.find('[data-testid="floor-select"]').setValue('new')

    expect(wrapper.emitted('commit')?.[0]).toEqual([{ position: { y: 6 } }])
  })

  it('does not expose a raw custom-Y numeric input', () => {
    const wrapper = mount(RoomInspector, {
      props: { room: makeRoom({ position: { x: 0, y: 0, z: 0 } }), floorLevels: [0, 3] },
    })
    expect(wrapper.find('[data-testid="y-custom-input"]').exists()).toBe(false)
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

  it('resyncs fields when the same reactive room object is mutated in place (e.g. moved by the 3D gizmo)', async () => {
    // `reactive()`, not plain object + setProps: production's `editor.draft` is a deeply-reactive
    // ref mutated in place by moveRoom/resizeRoom — setProps wouldn't exercise the same tracking path.
    const room = reactive(makeRoom())
    const wrapper = mount(RoomInspector, { props: { room, floorLevels: [0, 3] } })

    room.position.y = 3
    room.name = 'Renamed In Place'
    await nextTick()

    expect(
      (wrapper.find('[data-testid="name-input"]').element as HTMLInputElement).value,
    ).toBe('Renamed In Place')
    expect((wrapper.find('[data-testid="floor-select"]').element as HTMLSelectElement).value).toBe(
      '3',
    )
  })
})
