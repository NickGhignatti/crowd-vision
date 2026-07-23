import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, computed } from 'vue'
import RegisterBuildingModal from '../../creation/RegisterBuildingModal.vue'

// Real Vue refs (not plain values) so v-if="hasData && draft" unwraps correctly in the
// template; vi.mock's factory runs lazily, so ref/computed are safe to reference here.

const draftRef = ref<any>(null)
const mockSubmit = vi.fn().mockResolvedValue(undefined)
const mockClear = vi.fn()
const mockLoadFromJson = vi.fn()
const mockUpdateBuilding = vi.fn()
const mockUpdateRoom = vi.fn()

vi.mock('@/composables/building/useBuildingDraft', () => ({
  useBuildingDraft: () => ({
    draft: draftRef,
    hasData: computed(() => draftRef.value !== null),
    isSubmitting: ref(false),
    loadFromJson: mockLoadFromJson,
    updateBuilding: mockUpdateBuilding,
    updateRoom: mockUpdateRoom,
    clear: mockClear,
    submit: mockSubmit,
  }),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const mountModal = (props = {}) =>
  mount(RegisterBuildingModal, {
    props: { isOpen: true, domainName: 'acme.org', ...props },
    global: {
      mocks: { t: (key: string) => key },
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        Transition: { template: '<div><slot /></div>' },
        UploadZoneButton: {
          template: '<button class="upload-zone-stub" />',
          emits: ['file-selected'],
        },
        FullWidthInput: { template: '<input class="full-width-stub" />' },
        RangeSlider: { template: '<div class="range-slider-stub" />' },
        BuildingRoomCard: { template: '<div class="room-card-stub" />' },
      },
    },
  })

const makeDraft = () => ({
  name: 'Test Building',
  thresholds: { minTemp: 18, maxTemp: 27, maxAqi: 75, maxCo2: 1000 },
  rooms: [],
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RegisterBuildingModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    draftRef.value = null
  })

  describe('visibility', () => {
    it('renders the upload zone when isOpen is true', () => {
      const wrapper = mountModal({ isOpen: true })
      expect(wrapper.find('.upload-zone-stub').exists()).toBe(true)
    })

    it('does not render content when isOpen is false', () => {
      const wrapper = mountModal({ isOpen: false })
      expect(wrapper.find('.upload-zone-stub').exists()).toBe(false)
    })

    it('shows the form section only when draft has data', async () => {
      const wrapper = mountModal()
      expect(wrapper.find('.full-width-stub').exists()).toBe(false)

      draftRef.value = makeDraft()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.full-width-stub').exists()).toBe(true)
    })
  })

  describe('upload zone', () => {
    it('calls loadFromJson when a valid JSON file is selected', async () => {
      const wrapper = mountModal()
      const file = new File(['{"name":"Campus"}'], 'building.json', {
        type: 'application/json',
      })

      // Trigger the handler directly — stub buttons fire DOM events,
      // but the parent listens for Vue component emits (different channel).
      await (wrapper.vm as any).handleFileSelected(file)
      await flushPromises()

      expect(mockLoadFromJson).toHaveBeenCalled()
    })

    it('shows error message when JSON parsing fails', async () => {
      const wrapper = mountModal()

      // Simulate what the component does on a bad file
      // by checking the error state appears after an invalid file
      const invalidFile = new File(['not json!!!'], 'bad.json', {
        type: 'application/json',
      })
      const uploadZone = wrapper.findComponent({ template: '<button class="upload-zone-stub" />' })

      // Directly call the handler to trigger the parse error path
      await (wrapper.vm as any).handleFileSelected(invalidFile)
      await flushPromises()

      expect(wrapper.find('.ph-warning-circle').exists()).toBe(true)
    })
  })

  describe('footer buttons', () => {
    it('Save button is disabled when draft has no data', () => {
      const wrapper = mountModal()
      const saveBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('commons.save'))!

      expect(saveBtn.attributes('disabled')).toBeDefined()
    })

    it('Save button is enabled when draft has data', async () => {
      draftRef.value = makeDraft()
      const wrapper = mountModal()
      await wrapper.vm.$nextTick()

      const saveBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('commons.save'))!

      expect(saveBtn.attributes('disabled')).toBeUndefined()
    })

    it('Cancel clears the draft and emits close', async () => {
      const wrapper = mountModal()

      const cancelBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('commons.cancel'))!
      await cancelBtn.trigger('click')

      expect(mockClear).toHaveBeenCalled()
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('clicking the X button clears draft and emits close', async () => {
      const wrapper = mountModal()

      await wrapper.find('.ph-x').trigger('click')

      expect(mockClear).toHaveBeenCalled()
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('Save calls submit and emits close on success', async () => {
      draftRef.value = makeDraft()
      const wrapper = mountModal()
      await wrapper.vm.$nextTick()

      const saveBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('commons.save'))!
      await saveBtn.trigger('click')
      await flushPromises()

      expect(mockSubmit).toHaveBeenCalledWith('acme.org', [])
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })
})
