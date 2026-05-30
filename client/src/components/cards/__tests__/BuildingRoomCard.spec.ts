import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import BuildingRoomCard from '../BuildingRoomCard.vue'
import type { RoomDraft } from '@/models/buildingDraft'

const makeRoom = (overrides: Partial<RoomDraft> = {}): RoomDraft => ({
  id: 'G-Room-001',
  name: 'Ground Floor Room 1',
  capacity: 30,
  position: {},
  dimensions: {},
  thresholds: { minTemp: 18, maxTemp: 27, maxAqi: 75, maxCo2: 1000, maxPeople: 30 },
  ...overrides,
})

const mountCard = (room = makeRoom()) =>
  mount(BuildingRoomCard, {
    props: { room },
    global: {
      mocks: { t: (key: string) => key },
      stubs: { RangeSlider: { template: '<div class="range-slider-stub" />' } },
    },
  })

describe('BuildingRoomCard', () => {
  it('renders room name in an editable input', () => {
    const wrapper = mountCard()
    const nameInput = wrapper.find('input[type="text"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Ground Floor Room 1')
  })

  it('renders the room id as a secondary label', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('G-Room-001')
  })

  it('emits update with new name when name input changes', async () => {
    const wrapper = mountCard()
    await wrapper.find('input[type="text"]').setValue('Updated Name')

    expect(wrapper.emitted('update')).toHaveLength(1)
    expect((wrapper.emitted('update')![0][0] as any).name).toBe('Updated Name')
  })

  it('renders capacity input with the current value', () => {
    const wrapper = mountCard(makeRoom({ thresholds: { minTemp: 18, maxTemp: 27, maxAqi: 75, maxCo2: 1000, maxPeople: 45 }, capacity: 45 }))
    const capacityInput = wrapper.find('input[type="number"]')
    expect((capacityInput.element as HTMLInputElement).value).toBe('45')
  })

  it('emits update with new capacity when capacity input changes', async () => {
    const wrapper = mountCard()
    await wrapper.find('input[type="number"]').setValue(50)

    const emitted = wrapper.emitted('update')![0][0] as any
    expect(emitted.capacity).toBe(50)
    expect(emitted.thresholds.maxPeople).toBe(50)
  })

  it('renders two range sliders (temperature and AQI)', () => {
    const wrapper = mountCard()
    expect(wrapper.findAll('.range-slider-stub')).toHaveLength(2)
  })
})
