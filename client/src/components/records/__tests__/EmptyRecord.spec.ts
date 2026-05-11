import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyRecord from '../EmptyRecord.vue'
import type { TableHeader } from '../../tables/BuildingTable.vue'

describe('EmptyRecord.vue', () => {
  const headers: TableHeader[] = [
    { key: 'room', label: 'Col 1', cellClass: 'custom-class-1' },
    { key: 'temp', label: 'Col 2' },
    { key: 'status', label: 'Col 3', cellClass: 'custom-class-3' },
  ]

  it('renders the correct number of rows based on count', () => {
    const count = 3
    const wrapper = mount(EmptyRecord, {
      props: {
        count,
        headers,
      },
    })

    const rows = wrapper.findAll('tr')
    expect(rows).toHaveLength(count)
  })

  it('renders the correct number of cells in each row', () => {
    const wrapper = mount(EmptyRecord, {
      props: {
        count: 1,
        headers,
      },
    })

    const cells = wrapper.findAll('td')
    expect(cells).toHaveLength(headers.length)
  })

  it('applies header.cellClass to the cells', () => {
    const wrapper = mount(EmptyRecord, {
      props: {
        count: 1,
        headers,
      },
    })

    const cells = wrapper.findAll('td')
    expect(cells[0]!.classes()).toContain('custom-class-1')
    expect(cells[1]!.classes()).not.toContain('custom-class-1')
    expect(cells[2]!.classes()).toContain('custom-class-3')
  })

  it('renders non-breaking spaces in cells', () => {
    const wrapper = mount(EmptyRecord, {
      props: {
        count: 1,
        headers,
      },
    })

    const cell = wrapper.find('td')
    expect(cell.html()).toContain('&nbsp;')
  })

  it('renders nothing when count is 0', () => {
    const wrapper = mount(EmptyRecord, {
      props: {
        count: 0,
        headers,
      },
    })

    expect(wrapper.findAll('tr')).toHaveLength(0)
  })
})
