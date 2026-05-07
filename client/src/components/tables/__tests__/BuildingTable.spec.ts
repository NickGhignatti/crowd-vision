import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import BuildingTable from '../BuildingTable.vue'
import PaginationControls from '@/components/panels/PaginationControls.vue'

interface TableHeader {
  key: keyof TableBody
  label: string
  cellClass?: string
}

interface TableBody {
  room: string
  roomId: string
  status: string
  teacher: string
  temp: string
  people: string
  capacity: string
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useSensorData', () => ({
  getBuildingData: () => ({
    data: ref([]),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

vi.mock('@/helpers/colors.ts', () => ({
  roomColorByTemperature: () => 'rgb(1, 2, 3)',
}))

const headers: TableHeader[] = [
  { key: 'room', label: 'Room' },
  { key: 'status', label: 'Status' },
]

const makeItems = (count: number): TableBody[] =>
  Array.from({ length: count }, (_, i) => ({
    room: `Room ${i}`,
    roomId: `room-${i}`,
    status: 'active',
    teacher: 'Teacher',
    temp: '22°C',
    people: '10',
    capacity: '20',
  }))

const createWrapper = (props = {}, options = {}) =>
  mount(BuildingTable, {
    props: {
      headers,
      roomsData: makeItems(15),
      itemsPerPage: 5,
      selectedBuildingId: 'building-1',
      ...props,
    },
    global: {
      stubs: {
        PaginationControls: true,
      },
    },
    ...options,
  })

describe('BuildingTable', () => {
  describe('pagination', () => {
    it('shows only the first page items initially', () => {
      const wrapper = createWrapper()

      expect(wrapper.text()).toContain('Room 0')
      expect(wrapper.text()).not.toContain('Room 5')
    })

    it('goes to next page when next button is clicked', async () => {
      const wrapper = createWrapper()
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('next-page')

      expect(wrapper.text()).toContain('Room 5')
      expect(wrapper.text()).not.toContain('Room 0')
    })

    it('goes to previous page when prev button is clicked', async () => {
      const wrapper = createWrapper()
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('next-page')
      await pagination.vm.$emit('prev-page')

      expect(wrapper.text()).toContain('Room 0')
      expect(wrapper.text()).not.toContain('Room 5')
    })

    it('disables prev button on first page', () => {
      const wrapper = createWrapper(
        {},
        {
          global: { stubs: { PaginationControls: false } },
        },
      )

      const prevBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('dashboard.table.buttons.previous'))
      expect(prevBtn?.attributes('disabled')).toBeDefined()
    })

    it('disables next button on last page', async () => {
      const wrapper = createWrapper(
        {
          roomsData: makeItems(5),
          itemsPerPage: 5,
        },
        {
          global: { stubs: { PaginationControls: false } },
        },
      )

      const nextBtn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('dashboard.table.buttons.next'))
      expect(nextBtn?.attributes('disabled')).toBeDefined()
    })

    it('shows empty rows to fill up itemsPerPage on last page', async () => {
      const wrapper = createWrapper({ roomsData: makeItems(6), itemsPerPage: 5 })
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('next-page')

      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(5)
    })

    it('shows no data message when roomsData is empty', () => {
      const wrapper = createWrapper({ roomsData: [] })

      expect(wrapper.text()).toContain('dashboard.table.noDataAvailable')
    })

    it('applies temperature color styling for temp cells', () => {
      const tempHeaders: TableHeader[] = [
        { key: 'room', label: 'Room' },
        { key: 'temp', label: 'Temp' },
      ]
      const wrapper = createWrapper({
        headers: tempHeaders,
        roomsData: makeItems(1),
        itemsPerPage: 5,
      })

      const temperatureCell = wrapper.find('tbody td:nth-child(2) span')
      expect(temperatureCell.attributes('style')).toContain('color: rgb(1, 2, 3)')
    })
  })

  describe('autoplay', () => {
    it('starts autoplay when autoplay button is clicked', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('toggle-auto-play')

      expect((wrapper.vm as any).isAutoPlaying).toBe(true)
      vi.useRealTimers()
    })

    it('advances to next page after 2 seconds of autoplay', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('toggle-auto-play')
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Room 5')
      vi.useRealTimers()
    })

    it('wraps back to first page when autoplay reaches last page', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper({ roomsData: makeItems(10), itemsPerPage: 5 })
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('toggle-auto-play')
      vi.advanceTimersByTime(4000) // 1st page -> 2nd page (2s) -> 1st page (4s)
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Room 0')
      vi.useRealTimers()
    })

    it('stops autoplay when toggled off', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()
      const pagination = wrapper.findComponent(PaginationControls)

      await pagination.vm.$emit('toggle-auto-play')
      await pagination.vm.$emit('toggle-auto-play')

      expect((wrapper.vm as any).isAutoPlaying).toBe(false)
      vi.useRealTimers()
    })
  })
})
