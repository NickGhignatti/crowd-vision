import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EditRoom from '@/components/modals/EditRoom.vue'

// Mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('EditRoom.vue', () => {
  const mockRoom = {
    id: 'Room-A1',
    capacity: 20,
    maxTemperature: 24,
    color: '#10b981',
    position: { x: 0, y: 0, z: 0 },
    dimensions: { width: 0, height: 0, depth: 0 },
  }

  // Helper to mount with transitions stubbed out so v-if renders immediately
  const mountModal = (props = {}) => {
    return mount(EditRoom, {
      props: {
        isOpen: true,
        room: mockRoom,
        ...props,
      },
      global: {
        stubs: {
          // Stub transition to render content immediately without waiting for animation classes
          Transition: {
            template: '<div><slot /></div>',
          },
        },
      },
    })
  }

  it('does not render when isOpen is false', () => {
    const wrapper = mountModal({ isOpen: false })
    expect(wrapper.find('.fixed.inset-0').exists()).toBe(false)
  })

  it('renders and initializes form with room data', () => {
    const wrapper = mountModal()

    // Check visibility
    expect(wrapper.find('.fixed.inset-0').exists()).toBe(true)

    // Check inputs match mockRoom data
    const inputs = wrapper.findAll('input')

    expect((inputs[0].element as HTMLInputElement).value).toBe('Room-A1')
    expect((inputs[1].element as HTMLInputElement).value).toBe('20')
    expect((inputs[2].element as HTMLInputElement).value).toBe('24')
  })

  it('updates form values when inputs change', async () => {
    const wrapper = mountModal()

    // Find inputs
    const idInput = wrapper.find('input[type="text"]')
    const capacityInput = wrapper.find('input[type="number"]')

    // Update ID
    await idInput.setValue('Room-Updated')

    // Update Capacity
    await capacityInput.setValue(50)

    // Verify form state
    expect((idInput.element as HTMLInputElement).value).toBe('Room-Updated')
    expect((capacityInput.element as HTMLInputElement).value).toBe('50')
  })

  it('emits save event with updated data', async () => {
    const wrapper = mountModal()

    // Change some values
    const capacityInput = wrapper.findAll('input[type="number"]')[0] // First number input is capacity
    await capacityInput.setValue(99)

    // Find Save button (contains "check" icon or text "modals.editRoom.save")
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.save'))
    await saveBtn?.trigger('click')

    // Assert 'save' emitted
    expect(wrapper.emitted('save')).toBeTruthy()
    const emitPayload = wrapper.emitted('save')?.[0][0] as Record<string, unknown>

    expect(emitPayload).toMatchObject({
      id: 'Room-A1',
      capacity: 99,
      maxTemperature: 24,
    })

    // Assert 'close' also emitted
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close event when clicking cancel', async () => {
    const wrapper = mountModal()

    const cancelBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('commons.cancel'))
    await cancelBtn?.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('save')).toBeFalsy()
  })

  it('emits close event when clicking backdrop', async () => {
    const wrapper = mountModal()

    // The backdrop is the first div inside the fixed container
    const backdrop = wrapper.find('.absolute.inset-0')
    await backdrop.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
