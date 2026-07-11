import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlanRoom from '@/components/scene/PlanRoom.vue'
import type { Room } from '@/models/building.ts'

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1',
  name: 'Room 1',
  capacity: 10,
  position: { x: 0, y: 2, z: 0 },
  dimensions: { width: 4, height: 3, depth: 6 },
  ...overrides,
})

const rect = { x: 10, y: 20, width: 80, height: 120 }

describe('PlanRoom', () => {
  it('renders the room rect at the given precomputed position', () => {
    const wrapper = mount(PlanRoom, {
      props: { room: makeRoom(), rect, isSelected: false, handles: [] },
    })

    const el = wrapper.find('[data-testid="plan-room-r1"]')
    expect(el.attributes('x')).toBe('10')
    expect(el.attributes('y')).toBe('20')
    expect(el.attributes('width')).toBe('80')
    expect(el.attributes('height')).toBe('120')
  })

  it('renders a white, empty interior like an architectural floor plan, even with a custom room color set', () => {
    const wrapper = mount(PlanRoom, {
      props: { room: makeRoom({ color: '#ff0000' }), rect, isSelected: false, handles: [] },
    })

    expect(wrapper.find('[data-testid="plan-room-r1"]').attributes('fill')).toBe('#ffffff')
  })

  it('draws the room boundary as a wall-like stroke, thicker than a plain outline', () => {
    const wrapper = mount(PlanRoom, {
      props: { room: makeRoom(), rect, isSelected: false, handles: [] },
    })

    expect(Number(wrapper.find('[data-testid="plan-room-r1"]').attributes('stroke-width'))).toBeGreaterThanOrEqual(2)
  })

  it('highlights the stroke when selected', () => {
    const selected = mount(PlanRoom, {
      props: { room: makeRoom(), rect, isSelected: true, handles: [] },
    })
    const unselected = mount(PlanRoom, {
      props: { room: makeRoom(), rect, isSelected: false, handles: [] },
    })

    expect(selected.find('[data-testid="plan-room-r1"]').attributes('stroke')).toBe('#059669')
    expect(unselected.find('[data-testid="plan-room-r1"]').attributes('stroke')).not.toBe('#059669')
  })

  it('renders one handle marker per entry in the handles prop', () => {
    const wrapper = mount(PlanRoom, {
      props: {
        room: makeRoom(),
        rect,
        isSelected: true,
        handles: [
          { id: 'e', x: 90, y: 80 },
          { id: 'w', x: 10, y: 80 },
        ],
      },
    })

    expect(wrapper.find('[data-testid="plan-handle-r1-e"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-handle-r1-w"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-handle-r1-n"]').exists()).toBe(false)
  })

  it('emits pointerdown when the room body is pressed', async () => {
    const wrapper = mount(PlanRoom, {
      props: { room: makeRoom(), rect, isSelected: false, handles: [] },
    })

    await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')

    expect(wrapper.emitted('pointerdown')).toHaveLength(1)
  })

  it('emits handle-pointerdown with the handle id when a handle is pressed', async () => {
    const wrapper = mount(PlanRoom, {
      props: {
        room: makeRoom(),
        rect,
        isSelected: true,
        handles: [{ id: 'se', x: 90, y: 140 }],
      },
    })

    await wrapper.find('[data-testid="plan-handle-r1-se"]').trigger('pointerdown')

    expect(wrapper.emitted('handle-pointerdown')?.[0]?.[0]).toBe('se')
  })
})
