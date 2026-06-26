import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataRecord from '../DataRecord.vue'
import type { TableHeader } from '@/models/table.ts'

describe('DataRecord.vue', () => {
  const headers: TableHeader[] = [
    { key: 'room', label: 'Room', cellClass: 'font-bold' },
    { key: 'temp', label: 'Temperature' },
    { key: 'status', label: 'Status' },
  ]

  const item = {
    room: 'Room 101',
    roomId: 'r101',
    status: 'Active',
    teacher: 'John Doe',
    temp: '22.5',
    people: '10',
    capacity: '30',
  }

  const createWrapper = (props = {}, slots = {}) =>
    mount(DataRecord, { props: { headers, item, ...props }, slots })

  it('renders a table row with the correct number of cells', () => {
    const wrapper = createWrapper()
    expect(wrapper.element.tagName).toBe('TR')
    expect(wrapper.findAll('td')).toHaveLength(headers.length)
  })

  it('renders the correct values in each cell by default', () => {
    // Headers without a metricKey fall back to the plain-text renderer.
    const wrapper = createWrapper()
    const cells = wrapper.findAll('td')

    expect(cells[0]!.text()).toBe('Room 101')
    expect(cells[1]!.text()).toBe('22.5')
    expect(cells[2]!.text()).toBe('Active')
  })

  it('applies cellClass from header to the td element', () => {
    const wrapper = createWrapper()
    const firstCell = wrapper.find('td')
    expect(firstCell.classes()).toContain('font-bold')
  })

  it('allows overriding cell content via slots', () => {
    const wrapper = createWrapper(
      {},
      {
        status:
          '<template #status="{ value }"><span class="custom-status">Status: {{ value }}</span></template>',
      },
    )

    const customStatus = wrapper.find('.custom-status')
    expect(customStatus.exists()).toBe(true)
    expect(customStatus.text()).toBe('Status: Active')

    // Other cells still use the default MetricCell rendering.
    expect(wrapper.find('td:nth-child(1)').text()).toBe('Room 101')
  })

  it('passes item and value to the slot', () => {
    const wrapper = createWrapper(
      {},
      {
        room: `
          <template #room="{ item, value }">
            <div class="room-slot">
              ID: {{ item.roomId }} - Name: {{ value }}
            </div>
          </template>
        `,
      },
    )

    const roomSlot = wrapper.find('.room-slot')
    expect(roomSlot.text()).toBe('ID: r101 - Name: Room 101')
  })
})
