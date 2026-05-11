import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataRecord from '../DataRecord.vue'
import type { TableHeader } from '../../tables/BuildingTable.vue'

// Mock the colors helper
vi.mock('@/helpers/colors.ts', () => ({
  roomColorByTemperature: vi.fn((temp: number) => temp > 25 ? 'red' : 'blue')
}))

import { roomColorByTemperature } from '@/helpers/colors.ts'

describe('DataRecord.vue', () => {
  const headers: TableHeader[] = [
    { key: 'room', label: 'Room', cellClass: 'font-bold' },
    { key: 'temp', label: 'Temperature' },
    { key: 'status', label: 'Status' }
  ]

  const item = {
    room: 'Room 101',
    roomId: 'r101',
    status: 'Active',
    teacher: 'John Doe',
    temp: '22.5',
    people: '10',
    capacity: '30'
  }

  const createWrapper = (props = {}, slots = {}) => {
    return mount(DataRecord, {
      props: {
        headers,
        item,
        ...props
      },
      slots,
      global: {
        stubs: {
          // Add any components that might be inside slots if necessary
        }
      }
    })
  }

  it('renders a table row with the correct number of cells', () => {
    const wrapper = createWrapper()
    expect(wrapper.element.tagName).toBe('TR')
    expect(wrapper.findAll('td')).toHaveLength(headers.length)
  })

  it('renders the correct values in each cell by default', () => {
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

  it('applies dynamic color to temp cell using roomColorByTemperature', () => {
    const wrapper = createWrapper()
    const tempSpan = wrapper.find('td:nth-child(2) span')

    expect(roomColorByTemperature).toHaveBeenCalledWith(22.5)
    expect(tempSpan.attributes('style')).toContain('color: blue')
  })

  it('uses "inherit" color for non-temp cells', () => {
    const wrapper = createWrapper()
    const roomSpan = wrapper.find('td:nth-child(1) span')
    const statusSpan = wrapper.find('td:nth-child(3) span')

    expect(roomSpan.attributes('style')).toContain('color: inherit')
    expect(statusSpan.attributes('style')).toContain('color: inherit')
  })

  it('allows overriding cell content via slots', () => {
    const wrapper = createWrapper({}, {
      status: '<template #status="{ value }"><span class="custom-status">Status: {{ value }}</span></template>'
    })

    const customStatus = wrapper.find('.custom-status')
    expect(customStatus.exists()).toBe(true)
    expect(customStatus.text()).toBe('Status: Active')

    // Check that other cells still use default rendering
    expect(wrapper.find('td:nth-child(1)').text()).toBe('Room 101')
  })

  it('passes item and value to the slot', () => {
    const wrapper = createWrapper({}, {
      room: `
        <template #room="{ item, value }">
          <div class="room-slot">
            ID: {{ item.roomId }} - Name: {{ value }}
          </div>
        </template>
      `
    })

    const roomSlot = wrapper.find('.room-slot')
    expect(roomSlot.text()).toBe('ID: r101 - Name: Room 101')
  })
})
