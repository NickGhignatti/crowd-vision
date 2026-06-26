import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricBar from '../MetricBar.vue'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

const row = { capacity: '120' } as unknown as TableBody

const display = (overrides: Partial<MetricDisplay> = {}): MetricDisplay => ({
  renderer: 'bar',
  range: (r) => ({ min: 0, max: Number(r.capacity) || 0 }),
  color: () => '#abcdef',
  ...overrides,
})

const fillStyle = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('.h-full').attributes('style') ?? ''

describe('MetricBar.vue', () => {
  it('renders a "value/max" label', () => {
    const wrapper = mount(MetricBar, { props: { display: display(), value: '58', row } })
    expect(wrapper.text()).toContain('58/120')
  })

  it('fills the bar proportionally within [min,max]', () => {
    const wrapper = mount(MetricBar, { props: { display: display(), value: '60', row } })
    expect(fillStyle(wrapper)).toContain('width: 50%')
  })

  it('clamps the fill at 100% when over capacity', () => {
    const wrapper = mount(MetricBar, { props: { display: display(), value: '200', row } })
    expect(fillStyle(wrapper)).toContain('width: 100%')
  })

  it('shows an empty bar and the raw value for non-numeric input', () => {
    const wrapper = mount(MetricBar, { props: { display: display(), value: '--', row } })
    expect(fillStyle(wrapper)).toContain('width: 0%')
    expect(wrapper.text()).toContain('--')
  })

  it('asks the descriptor for the fill colour', () => {
    const color = vi.fn(() => '#abcdef')
    mount(MetricBar, { props: { display: display({ color }), value: '58', row } })
    expect(color).toHaveBeenCalledWith(58, row)
  })
})
