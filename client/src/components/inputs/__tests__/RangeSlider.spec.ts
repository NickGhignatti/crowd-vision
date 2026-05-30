import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import RangeSlider from '../RangeSlider.vue'

const mountSlider = (props = {}) =>
  mount(RangeSlider, {
    props: { min: 0, max: 50, minValue: 10, maxValue: 40, ...props },
  })

describe('RangeSlider', () => {
  it('renders two range inputs', () => {
    const wrapper = mountSlider()
    expect(wrapper.findAll('input[type="range"]')).toHaveLength(2)
  })

  it('shows the current min and max badge values', () => {
    const wrapper = mountSlider({ minValue: 15, maxValue: 35, unit: '°C' })
    const text = wrapper.text()
    expect(text).toContain('15°C')
    expect(text).toContain('35°C')
  })

  it('shows the domain bounds (min/max labels)', () => {
    const wrapper = mountSlider({ min: 0, max: 50, unit: '°C' })
    const text = wrapper.text()
    expect(text).toContain('0°C')
    expect(text).toContain('50°C')
  })

  it('emits update:minValue when the min thumb changes', async () => {
    const wrapper = mountSlider({ minValue: 10, maxValue: 40 })
    const [minInput] = wrapper.findAll('input[type="range"]')

    await minInput!.setValue(20)

    expect(wrapper.emitted('update:minValue')).toHaveLength(1)
    expect(wrapper.emitted('update:minValue')![0]![0]).toBe(20)
  })

  it('emits update:maxValue when the max thumb changes', async () => {
    const wrapper = mountSlider({ minValue: 10, maxValue: 40 })
    const [, maxInput] = wrapper.findAll('input[type="range"]')

    await maxInput!.setValue(45)

    expect(wrapper.emitted('update:maxValue')).toHaveLength(1)
    expect(wrapper.emitted('update:maxValue')![0]![0]).toBe(45)
  })

  it('clamps min so it does not exceed max', async () => {
    const wrapper = mountSlider({ minValue: 10, maxValue: 30, step: 1 })
    const [minInput] = wrapper.findAll('input[type="range"]')

    await minInput!.setValue(35)

    const emitted = wrapper.emitted('update:minValue')![0]![0] as number
    expect(emitted).toBeLessThan(30)
  })

  it('clamps max so it does not fall below min', async () => {
    const wrapper = mountSlider({ minValue: 20, maxValue: 30, step: 1 })
    const [, maxInput] = wrapper.findAll('input[type="range"]')

    await maxInput!.setValue(5)

    const emitted = wrapper.emitted('update:maxValue')![0]![0] as number
    expect(emitted).toBeGreaterThan(20)
  })
})
