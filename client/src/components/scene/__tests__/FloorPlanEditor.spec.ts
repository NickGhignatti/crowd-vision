import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FloorPlanEditor from '@/components/scene/FloorPlanEditor.vue'
import type { Room } from '@/models/building.ts'

const makeRoom = (id: string, overrides: Partial<Room> = {}): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 0, y: 2, z: 0 },
  dimensions: { width: 4, height: 3, depth: 6 },
  ...overrides,
})

// Viewport is fixed at width:800 height:600 scale:20 centerX/Z:0 (see the
// component) — so world (0,0) projects to screen (400,300) and every world
// unit is 20 screen pixels.
const stubBoundingRect = (wrapper: ReturnType<typeof mount>) => {
  const svg = wrapper.find('[data-testid="floor-plan"]').element as unknown as SVGSVGElement
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => '',
    }) as DOMRect
}

const dispatchWindowPointer = (type: 'pointermove' | 'pointerup', clientX = 0, clientY = 0) => {
  window.dispatchEvent(new PointerEvent(type, { clientX, clientY }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FloorPlanEditor', () => {
  it('projects a room to the correct screen rect', () => {
    const room = makeRoom('r1', { position: { x: 1, y: 0, z: 2 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const wrapper = mount(FloorPlanEditor, { props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' } })

    const rect = wrapper.find('[data-testid="plan-room-r1"]')
    // topLeft.x = 400 + (1 - 2)*20 = 380; topLeft.y = 300 + (2 - 3)*20 = 280
    expect(rect.attributes('x')).toBe('380')
    expect(rect.attributes('y')).toBe('280')
    expect(rect.attributes('width')).toBe('80') // 4 * 20
    expect(rect.attributes('height')).toBe('120') // 6 * 20
  })

  it('projects rooms using the actual measured container size, not a fixed 800x600 box', async () => {
    // Stubbed BEFORE mount, on the prototype: onMounted's initial measurement
    // reads this the instant the component mounts. This is the responsive-
    // sizing fix for a real bug: a hardcoded 800x600 canvas sat in the corner
    // of a much larger viewport, and floating panels (RoomInspector) could
    // overlap and block dragging wherever a room happened to land in that box.
    const getRectSpy = vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1200,
      height: 700,
      right: 1200,
      bottom: 700,
      x: 0,
      y: 0,
      toJSON: () => '',
    } as DOMRect)

    const room = makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
    const wrapper = mount(FloorPlanEditor, {
      props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' },
    })
    await wrapper.vm.$nextTick()

    // Center is now (600, 350), not (400, 300): topLeft.x = 600 + (0-2)*20 = 560
    const rect = wrapper.find('[data-testid="plan-room-r1"]')
    expect(rect.attributes('x')).toBe('560')
    expect(rect.attributes('y')).toBe('290') // 350 + (0-3)*20

    getRectSpy.mockRestore()
  })

  it('shows resize handles only for the selected room', () => {
    const rooms = [makeRoom('r1'), makeRoom('r2')]
    const wrapper = mount(FloorPlanEditor, { props: { rooms, floorY: 0, selectedId: 'r1', planTool: 'select' } })

    expect(wrapper.find('[data-testid="plan-handle-r1-e"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-handle-r2-e"]').exists()).toBe(false)
  })

  describe('zoom (mouse wheel)', () => {
    it('zooms out (shrinks the projected size) on a downward wheel scroll', async () => {
      const room = makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      const before = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')
      await wrapper.find('[data-testid="floor-plan"]').trigger('wheel', { deltaY: 100 })

      const after = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')
      expect(Number(after)).toBeLessThan(Number(before))
    })

    it('zooms in (grows the projected size) on an upward wheel scroll', async () => {
      const room = makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      const before = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')
      await wrapper.find('[data-testid="floor-plan"]').trigger('wheel', { deltaY: -100 })

      const after = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')
      expect(Number(after)).toBeGreaterThan(Number(before))
    })

    it('prevents the default page-scroll behavior', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 0, selectedId: null, planTool: 'select' } })
      stubBoundingRect(wrapper)

      let capturedEvent: Event | null = null
      wrapper.find('[data-testid="floor-plan"]').element.addEventListener('wheel', (event) => {
        capturedEvent = event
      })

      await wrapper.find('[data-testid="floor-plan"]').trigger('wheel', { deltaY: 100 })

      expect(capturedEvent).not.toBeNull()
      expect((capturedEvent as unknown as Event).defaultPrevented).toBe(true)
    })

    it('clamps zoom-out so it never shrinks below a usable minimum', async () => {
      const room = makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      // One enormous scroll should hit the floor; a second identical scroll
      // must not shrink it any further.
      await wrapper.find('[data-testid="floor-plan"]').trigger('wheel', { deltaY: 100000 })
      const clamped = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')

      await wrapper.find('[data-testid="floor-plan"]').trigger('wheel', { deltaY: 100000 })
      const stillClamped = wrapper.find('[data-testid="plan-room-r1"]').attributes('width')

      expect(stillClamped).toBe(clamped)
    })
  })

  describe('select tool (default)', () => {
    it('emits select with the room id when a room is clicked', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'select' },
      })

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')

      expect(wrapper.emitted('select')?.[0]).toEqual(['r1'])
    })

    it('emits select(null) when the background is clicked, without starting a draw drag', async () => {
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 10, clientY: 10 })

      expect(wrapper.emitted('select')?.[0]).toEqual([null])
      // The bug this guards against: any plain click on the background used
      // to unconditionally start (and eventually commit) a room-drawing
      // gesture, so "select" mode must never enter a drag at all here.
      expect(wrapper.emitted('dragging')).toBeUndefined()

      dispatchWindowPointer('pointermove', 500, 500)
      dispatchWindowPointer('pointerup', 500, 500)
      expect(wrapper.emitted('add-room')).toBeUndefined()
    })

    it('drags a room body and emits move with the pointer world position', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')
      dispatchWindowPointer('pointermove', 500, 340) // world: x=(500-400)/20=5, z=(340-300)/20=2
      await wrapper.vm.$nextTick()

      const moveEvents = wrapper.emitted('move')
      expect(moveEvents).toBeTruthy()
      const [id, position] = moveEvents![moveEvents!.length - 1]!
      expect(id).toBe('r1')
      expect(position).toEqual({ x: 5, z: 2 })

      dispatchWindowPointer('pointerup')
    })

    it('stops emitting move after pointerup', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')
      dispatchWindowPointer('pointermove', 420, 300)
      dispatchWindowPointer('pointerup')
      const countAfterUp = wrapper.emitted('move')?.length ?? 0

      dispatchWindowPointer('pointermove', 440, 300)
      expect(wrapper.emitted('move')?.length ?? 0).toBe(countAfterUp)
    })

    it('drags the east handle and emits resize with a face-anchored result', async () => {
      // room spans x:[-2,2] z:[-3,3] (position x=0,z=0, width=4, depth=6)
      const room = makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-handle-r1-e"]').trigger('pointerdown')
      // pointer at world x=5 (screen 500), z=0 (screen 300)
      dispatchWindowPointer('pointermove', 500, 300)
      await wrapper.vm.$nextTick()

      const resizeEvents = wrapper.emitted('resize')
      expect(resizeEvents).toBeTruthy()
      const [id, result] = resizeEvents![resizeEvents!.length - 1]!
      expect(id).toBe('r1')
      expect(result).toMatchObject({ width: 7, widthAnchor: 'min' }) // 5 - (-2)

      dispatchWindowPointer('pointerup')
    })

    it('emits dragging(true) on drag start and dragging(false) on drag end (move)', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')
      expect(wrapper.emitted('dragging')?.[0]).toEqual([true])

      dispatchWindowPointer('pointerup')
      const draggingEvents = wrapper.emitted('dragging') ?? []
      expect(draggingEvents[draggingEvents.length - 1]).toEqual([false])
    })

    it('emits dragging(true)/(false) around a handle resize drag', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-handle-r1-e"]').trigger('pointerdown')
      expect(wrapper.emitted('dragging')?.[0]).toEqual([true])

      dispatchWindowPointer('pointerup')
      const draggingEvents = wrapper.emitted('dragging') ?? []
      expect(draggingEvents[draggingEvents.length - 1]).toEqual([false])
    })

    it('removes its window pointer listeners on unmount (no leak if unmounted mid-drag)', async () => {
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: 'r1', planTool: 'select' },
      })
      stubBoundingRect(wrapper)

      const removeSpy = vi.spyOn(window, 'removeEventListener')

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown')
      wrapper.unmount()

      const removedTypes = removeSpy.mock.calls.map((call) => call[0])
      expect(removedTypes).toContain('pointermove')
      expect(removedTypes).toContain('pointerup')
    })
  })

  describe('add tool', () => {
    it('draws a new room on the empty background and emits add-room on release', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 4, selectedId: null, planTool: 'add' } })
      stubBoundingRect(wrapper)

      // start at world (-2,-3) = screen (360, 240); end at world (2,3) = screen (440,360)
      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 360, clientY: 240 })
      dispatchWindowPointer('pointermove', 440, 360)
      await wrapper.vm.$nextTick()
      dispatchWindowPointer('pointerup', 440, 360)

      const addEvents = wrapper.emitted<[{ position: Room['position']; dimensions: Room['dimensions'] }]>(
        'add-room',
      )
      expect(addEvents).toBeTruthy()
      const [seed] = addEvents![0]!
      expect(seed.position).toEqual({ x: 0, y: 4, z: 0 })
      expect(seed.dimensions.width).toBe(4)
      expect(seed.dimensions.depth).toBe(6)
    })

    it('starts drawing a new room even when the pointer goes down on an existing room', async () => {
      // The draw tool takes priority over whatever's underneath it, the same
      // way a shape tool in a drawing app doesn't pick up existing objects.
      const room = makeRoom('r1')
      const wrapper = mount(FloorPlanEditor, {
        props: { rooms: [room], floorY: 0, selectedId: null, planTool: 'add' },
      })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="plan-room-r1"]').trigger('pointerdown', { clientX: 400, clientY: 300 })
      expect(wrapper.emitted('select')).toBeUndefined()
      expect(wrapper.emitted('dragging')?.[0]).toEqual([true])

      dispatchWindowPointer('pointermove', 440, 360)
      dispatchWindowPointer('pointerup', 440, 360)
      expect(wrapper.emitted('add-room')).toBeTruthy()
    })

    it('emits dragging(true)/(false) around drawing a new room', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 0, selectedId: null, planTool: 'add' } })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 400, clientY: 300 })
      expect(wrapper.emitted('dragging')?.[0]).toEqual([true])

      dispatchWindowPointer('pointerup', 440, 360)
      const draggingEvents = wrapper.emitted('dragging') ?? []
      expect(draggingEvents[draggingEvents.length - 1]).toEqual([false])
    })

    it('does not emit add-room for a plain click with no drag distance', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 0, selectedId: null, planTool: 'add' } })
      stubBoundingRect(wrapper)

      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 400, clientY: 300 })
      dispatchWindowPointer('pointerup', 400, 300)

      expect(wrapper.emitted('add-room')).toBeUndefined()
    })

    it('does not emit add-room for a drag shorter than the minimum distance', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 0, selectedId: null, planTool: 'add' } })
      stubBoundingRect(wrapper)

      // 2px screen drag = 0.1 world units, below the 0.3 minimum.
      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 400, clientY: 300 })
      dispatchWindowPointer('pointermove', 402, 300)
      dispatchWindowPointer('pointerup', 402, 300)

      expect(wrapper.emitted('add-room')).toBeUndefined()
    })

    it('emits add-room once the drag clears the minimum distance', async () => {
      const wrapper = mount(FloorPlanEditor, { props: { rooms: [], floorY: 0, selectedId: null, planTool: 'add' } })
      stubBoundingRect(wrapper)

      // 10px screen drag = 0.5 world units, above the 0.3 minimum.
      await wrapper.find('[data-testid="floor-plan"]').trigger('pointerdown', { clientX: 400, clientY: 300 })
      dispatchWindowPointer('pointermove', 410, 300)
      dispatchWindowPointer('pointerup', 410, 300)

      expect(wrapper.emitted('add-room')).toBeTruthy()
    })
  })
})
