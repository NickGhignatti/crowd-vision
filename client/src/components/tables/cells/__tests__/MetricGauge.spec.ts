import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricGauge from '../MetricGauge.vue'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

const row = {} as TableBody

const display = (overrides: Partial<MetricDisplay> = {}): MetricDisplay => ({
  renderer: 'gauge',
  icon: 'ph-thermometer',
  unit: '°C',
  color: () => '#10B981',
  ...overrides,
})

describe('MetricGauge.vue', () => {
  it('renders the parsed value with its unit', () => {
    const wrapper = mount(MetricGauge, { props: { display: display(), value: '22°C', row } })
    expect(wrapper.text()).toBe('22°C')
  })

  it('renders the descriptor icon', () => {
    const wrapper = mount(MetricGauge, { props: { display: display(), value: '22°C', row } })
    const icon = wrapper.find('i')
    expect(icon.classes()).toContain('ph-thermometer')
    expect(icon.classes()).toContain('ph-bold')
  })

  it('tints the value with the descriptor colour', () => {
    const color = vi.fn(() => '#10B981')
    const wrapper = mount(MetricGauge, { props: { display: display({ color }), value: '22°C', row } })
    expect(color).toHaveBeenCalledWith(22, row)
    expect(wrapper.find('span').attributes('style')).toContain('color: #10B981')
  })

  it('falls back to the raw value and inherited colour for non-numeric input', () => {
    const wrapper = mount(MetricGauge, { props: { display: display(), value: '--', row } })
    expect(wrapper.text()).toBe('--')
    expect(wrapper.find('span').attributes('style')).toContain('color: inherit')
  })
})
