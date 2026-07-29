import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EditRoomModal from '@/components/modals/editing/EditRoomModal.vue'
import type { Room } from '@/models/building.ts'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const FormFieldStub = {
  props: ['label', 'icon'],
  template: '<div class="form-field-stub"><slot /></div>',
}

const stubs = {
  FormField: FormFieldStub,
  // Stubbing Transition ensures the DOM isn't hidden by async animation frames during testing
  Transition: false,
}

const makeRoom = (overrides: Partial<Room> = {}): Room =>
  ({
    name: 'Room 1',
    id: 'room-1',
    capacity: 10,
    maxTemperature: 24,
    color: '#3b82f6',
    ...overrides,
  }) as unknown as Room

describe('EditRoomModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('does not render the modal content when isOpen is false', () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: false, room: makeRoom() },
        global: { stubs },
      })

      expect(wrapper.find('.fixed.inset-0').exists()).toBe(false)
    })

    it('renders the modal content when isOpen is true', () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room: makeRoom() },
        global: { stubs },
      })

      expect(wrapper.find('.fixed.inset-0').exists()).toBe(true)
      expect(wrapper.text()).toContain('model.rooms.editRoom.title')
    })
  })

  describe('state initialization and defaults', () => {
    it('populates the form with the provided room properties', async () => {
      const room = makeRoom({
        name: 'Conference A',
        id: 'conference-a',
        capacity: 25,
        maxTemperature: 21,
        color: '#ff0000',
      })

      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room },
        global: { stubs },
      })

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))
      await saveBtn?.trigger('click')

      const emittedPayload = wrapper.emitted('save')?.[0]?.[0]
      expect(emittedPayload).toEqual({
        name: 'Conference A',
        capacity: 25,
        maxTemperature: 21,
        color: '#ff0000',
      })
    })

    it('applies default maxTemperature and color if they are missing from the room prop', async () => {
      const room = makeRoom({
        name: 'Office B',
        id: 'office-b',
        capacity: 4,
        maxTemperature: undefined,
        color: undefined,
      } as unknown as Partial<Room>)

      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room },
        global: { stubs },
      })

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))
      await saveBtn?.trigger('click')

      const emittedPayload = wrapper.emitted('save')?.[0]?.[0]
      expect(emittedPayload).toEqual({
        name: 'Office B',
        capacity: 4,
        maxTemperature: 27,
        color: '#10b981',
      })
    })
  })

  describe('behavior and event emitting', () => {
    it('emits "close" when the backdrop overlay is clicked', async () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room: makeRoom() },
        global: { stubs },
      })

      await wrapper.find('.backdrop-blur-sm').trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits "close" when the cancel button is clicked', async () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room: makeRoom() },
        global: { stubs },
      })

      const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.cancel'))
      await cancelBtn?.trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('emits "save" with the form payload and then emits "close" when save is clicked', async () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room: makeRoom() },
        global: { stubs },
      })

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))
      await saveBtn?.trigger('click')

      expect(wrapper.emitted('save')).toBeTruthy()
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('does not emit "save" or "close" if the room prop is null during the save action', async () => {
      const wrapper = mount(EditRoomModal, {
        props: { isOpen: true, room: null },
        global: { stubs },
      })

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))
      await saveBtn?.trigger('click')

      expect(wrapper.emitted('save')).toBeUndefined()
      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })
})
