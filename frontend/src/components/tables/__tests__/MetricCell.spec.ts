import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricCell from '../MetricCell.vue'
import MetricBar from '@/components/tables/cells/MetricBar.vue'
import MetricGauge from '@/components/tables/cells/MetricGauge.vue'
import StatusPill from '@/components/tables/cells/StatusPill.vue'
import PlainValue from '@/components/tables/cells/PlainValue.vue'
import type { TableBody } from '@/models/table.ts'

const row = { capacity: '120' } as unknown as TableBody

const mountCell = (metricKey: string | undefined, value: unknown) =>
  mount(MetricCell, { props: { metricKey, value, row } })

describe('MetricCell.vue', () => {
  it('dispatches occupancy to the bar renderer', () => {
    const wrapper = mountCell('peopleCount', '58')
    expect(wrapper.findComponent(MetricBar).exists()).toBe(true)
    expect(wrapper.text()).toContain('58/120')
  })

  it('dispatches temperature to the gauge renderer', () => {
    const wrapper = mountCell('temperature', '22°C')
    expect(wrapper.findComponent(MetricGauge).exists()).toBe(true)
    expect(wrapper.find('i.ph-thermometer').exists()).toBe(true)
  })

  it('dispatches status to the pill renderer', () => {
    const wrapper = mountCell('status', 'dashboard.table.rooms.status.full')
    expect(wrapper.findComponent(StatusPill).exists()).toBe(true)
  })

  it('renders plain text when no metricKey is given', () => {
    const wrapper = mountCell(undefined, 'Hello')
    expect(wrapper.findComponent(PlainValue).exists()).toBe(true)
    expect(wrapper.text()).toBe('Hello')
  })

  it('falls back to plain text for an unknown metric (new-sensor guard)', () => {
    const wrapper = mountCell('totallyUnknownSensor', '42')
    expect(wrapper.findComponent(PlainValue).exists()).toBe(true)
    expect(wrapper.text()).toBe('42')
  })
})
