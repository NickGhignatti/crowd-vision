import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import RightMenu from '@/components/menus/RightMenu.vue'
import { makeRequest } from '@/composables/useApi'
import type { Building, Room } from '@/models/building'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockCanEdit = vi.fn().mockReturnValue(true)
vi.mock('@/composables/useUserPermissions', () => ({
  useUserPermissions: () => ({ canEdit: mockCanEdit }),
}))

vi.mock('@/composables/useApi', () => ({
  makeRequest: vi.fn(),
}))

vi.mock('@/composables/useSensorData', () => ({
  getBuildingData: vi.fn(() => ({
    data: ref([]),
    isLoading: ref(false),
    error: ref(null),
  })),
}))

const EditRoomStub = {
  props: ['isOpen', 'room'],
  emits: ['close', 'save'],
  template: '<div class="edit-room-stub" :data-open="isOpen"></div>',
}

const RoomCardStub = {
  props: ['room', 'isSelected', 'canEdit'],
  emits: ['select', 'edit'],
  template: '<div class="room-card-stub" :data-id="room.id"></div>',
}

const SearchBarStub = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<div class="search-bar-stub"></div>',
  // Expose an isOpen property so the parent's v-show template ref check doesn't fail
  data() {
    return { isOpen: false }
  },
}

const stubs = {
  EditRoom: EditRoomStub,
  RoomCard: RoomCardStub,
  RoomSearchBar: SearchBarStub,
  Transition: false, // Disable async animations for instant DOM updates
}

const makeRoom = (id: string, overrides: Partial<Room> = {}): Room =>
  ({
    id,
    name: id,
    capacity: 10,
    maxTemperature: 25,
    color: '#ffffff',
    ...overrides,
  }) as unknown as Room

const makeBuilding = (rooms: Room[] = []): Building =>
  ({
    id: 'bldg-1',
    name: 'Main Campus',
    domains: ['acme'],
    rooms,
  }) as unknown as Building

const makeResponse = (ok: boolean) => ({
  ok,
  json: vi.fn().mockResolvedValue({}),
})

describe('RightMenu.vue', () => {
  let originalScrollIntoView: typeof Element.prototype.scrollIntoView

  beforeEach(() => {
    vi.clearAllMocks()
    mockCanEdit.mockReturnValue(true) // Default to having permissions

    // JSDOM does not implement scrollIntoView, so we must mock it to prevent errors
    originalScrollIntoView = window.Element.prototype.scrollIntoView
    window.Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    window.Element.prototype.scrollIntoView = originalScrollIntoView
  })

  describe('rendering and layout', () => {
    it('shows the empty state when no building model is provided', () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: null, selectedRoomId: null },
        global: { stubs },
      })
      expect(wrapper.text()).toContain('model.noRooms')
    })

    it('shows the empty state when the building has no rooms', () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([]), selectedRoomId: null },
        global: { stubs },
      })
      expect(wrapper.text()).toContain('model.noRooms')
    })

    it('renders a RoomCard for each room in the building', () => {
      const building = makeBuilding([makeRoom('room-a'), makeRoom('room-b')])
      const wrapper = mount(RightMenu, {
        props: { buildingModel: building, selectedRoomId: null },
        global: { stubs },
      })

      const cards = wrapper.findAllComponents(RoomCardStub)
      expect(cards).toHaveLength(2)
      expect(cards[0]?.props('room').id).toBe('room-a')
    })

    it('evaluates user permissions and passes them to the RoomCard', () => {
      mockCanEdit.mockReturnValue(false) // Simulate read-only user
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([makeRoom('room-a')]), selectedRoomId: null },
        global: { stubs },
      })

      const card = wrapper.findComponent(RoomCardStub)
      expect(mockCanEdit).toHaveBeenCalledWith(['acme']) // Evaluated against building domains
      expect(card.props('canEdit')).toBe(false)
    })
  })

  describe('panel toggle behavior', () => {
    it('starts open and can be collapsed', async () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: null, selectedRoomId: null },
        global: { stubs },
      })

      const aside = wrapper.find('aside')
      expect(aside.classes()).toContain('w-80')

      const collapseBtn = wrapper.findAll('button').find((b) => b.find('.ph-caret-right').exists())
      await collapseBtn?.trigger('click')

      expect(aside.classes()).toContain('w-0')
      expect(aside.classes()).toContain('overflow-hidden')
    })

    it('can be expanded back when closed', async () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: null, selectedRoomId: null },
        global: { stubs },
      })

      const collapseBtn = wrapper.findAll('button').find((b) => b.find('.ph-caret-right').exists())
      await collapseBtn?.trigger('click')

      const expandBtn = wrapper.findAll('button').find((b) => b.find('.ph-caret-left').exists())
      await expandBtn?.trigger('click')

      expect(wrapper.find('aside').classes()).toContain('w-80')
    })
  })
  describe('search filtering', () => {
    it('filters the room list based on search query', async () => {
      const building = makeBuilding([
        makeRoom('Conference Room'),
        makeRoom('Office 1'),
        makeRoom('Office 2'),
      ])

      const wrapper = mount(RightMenu, {
        props: { buildingModel: building, selectedRoomId: null },
        global: { stubs },
      })

      expect(wrapper.findAllComponents(RoomCardStub)).toHaveLength(3)

      // Emit a search query from the SearchBar
      await wrapper.findComponent(SearchBarStub).vm.$emit('update:modelValue', 'office')

      const cards = wrapper.findAllComponents(RoomCardStub)
      expect(cards).toHaveLength(2) // Should only show the offices
      expect(wrapper.text()).not.toContain('model.noRooms')
    })

    it('shows the empty state message when search yields no results', async () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([makeRoom('Lobby')]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.findComponent(SearchBarStub).vm.$emit('update:modelValue', 'non-existent')

      expect(wrapper.findAllComponents(RoomCardStub)).toHaveLength(0)
      expect(wrapper.text()).toContain('model.noRooms')
    })
  })

  describe('interactions and scrolling', () => {
    it('emits toggle-select when a RoomCard triggers select', async () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([makeRoom('room-a')]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.findComponent(RoomCardStub).vm.$emit('select', 'room-a')

      expect(wrapper.emitted('toggle-select')).toBeTruthy()
      expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['room-a'])
    })

    it('scrolls the selected room into view when selectedRoomId prop changes', async () => {
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([makeRoom('room-a')]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.setProps({ selectedRoomId: 'room-a' })

      await flushPromises()

      // Expect the native scroll API to have been called on the container ref
      expect(window.Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      })
    })
  })


  describe('edit modal and saving', () => {
    it('opens the EditRoom modal with the correct room payload when a card triggers edit', async () => {
      const room = makeRoom('room-a')
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([room]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.findComponent(RoomCardStub).vm.$emit('edit', room)

      const editModal = wrapper.findComponent(EditRoomStub)
      expect(editModal.props('isOpen')).toBe(true)
      expect(editModal.props('room')).toEqual(room)
    })

    it('successfully calls API and optimistically updates the room state', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const room = makeRoom('room-a', { capacity: 10 })
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([room]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.findComponent(RoomCardStub).vm.$emit('edit', room)

      const updates = { capacity: 50 }
      await wrapper.findComponent(EditRoomStub).vm.$emit('save', updates)
      await flushPromises()

      // API was called with correct URL and Payload
      expect(makeRequest).toHaveBeenCalledWith('/twin/building/bldg-1/room/room-a', 'PATCH', {
        body: JSON.stringify(updates),
      })

      // Room object was mutated
      expect(room.capacity).toBe(50)
    })

    it('alerts the user and avoids optimistic updates if the API call fails', async () => {
      window.alert = vi.fn()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const room = makeRoom('room-a', { capacity: 10 })
      const wrapper = mount(RightMenu, {
        props: { buildingModel: makeBuilding([room]), selectedRoomId: null },
        global: { stubs },
      })

      await wrapper.findComponent(RoomCardStub).vm.$emit('edit', room)
      await wrapper.findComponent(EditRoomStub).vm.$emit('save', { capacity: 99 })
      await flushPromises()

      // Should alert error and prevent optimistic data manipulation
      expect(window.alert).toHaveBeenCalledWith('model.rooms.updateFailed')
      expect(room.capacity).toBe(10)

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      delete window.alert
      consoleSpy.mockRestore()
    })
  })
})
