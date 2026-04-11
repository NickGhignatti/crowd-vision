import { beforeAll, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

interface TableHeader {
  key: keyof TableBody
  label: string
  cellClass?: string
}

interface TableBody {
  room: string
  status: string
  teacher: string
  temp: string
  people: string
  capacity: string
}

let DataTable: any

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

vi.mock('@/composables/useSensorData.ts', () => ({
  getBuildingData: () => ({
    data: ref([]),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

beforeAll(async () => {
  DataTable = (await import('../DataTable.vue')).default
})

const headers: TableHeader[] = [
  { key: 'room', label: 'Room' },
  { key: 'status', label: 'Status' },
]

const makeItems = (count: number): TableBody[] =>
  Array.from({ length: count }, (_, i) => ({
    room: `Room ${i}`,
    status: 'active',
    teacher: 'Teacher',
    temp: '22°C',
    people: '10',
    capacity: '20',
  }))

const createWrapper = (props = {}) =>
  mount(DataTable, {
    props: { headers, roomsData: makeItems(15), itemsPerPage: 5, selectedBuildingId: 'building-1', ...props },
  })

describe('DataTable.vue', () => {
  describe('pagination', () => {
    it('shows only the first page items initially', () => {
      const wrapper = createWrapper()

      expect(wrapper.text()).toContain('Room 0')
      expect(wrapper.text()).not.toContain('Room 5')
    })

    it('goes to next page when next button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button:last-child').trigger('click')

      expect(wrapper.text()).toContain('Room 5')
      expect(wrapper.text()).not.toContain('Room 0')
    })

    it('goes to previous page when prev button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button:last-child').trigger('click') // next
      await wrapper.findAll('button')[1]?.trigger('click') // prev

      expect(wrapper.text()).toContain('Room 0')
      expect(wrapper.text()).not.toContain('Room 5')
    })

    it('disables prev button on first page', () => {
      const wrapper = createWrapper()

      expect(wrapper.findAll('button')[1]?.attributes('disabled')).toBeDefined()
    })

    it('disables next button on last page', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button:last-child').trigger('click')
      await wrapper.find('button:last-child').trigger('click')

      expect(wrapper.find('button:last-child').attributes('disabled')).toBeDefined()
    })

    it('shows empty rows to fill up itemsPerPage on last page', async () => {
      const wrapper = createWrapper({ roomsData: makeItems(6), itemsPerPage: 5 })

      await wrapper.find('button:last-child').trigger('click')

      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(5)
    })

    it('shows no data message when roomsData is empty', () => {
      const wrapper = createWrapper({ roomsData: [] })

      expect(wrapper.text()).toContain('dashboard.table.noDataAvailable')
    })
  })

  describe('autoplay', () => {
    it('starts autoplay when autoplay button is clicked', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()

      await wrapper.find('button:first-child').trigger('click')

      expect((wrapper.vm as unknown as { isAutoPlaying: boolean }).isAutoPlaying).toBe(true)
      vi.useRealTimers()
    })

    it('advances to next page after 2 seconds of autoplay', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()

      await wrapper.find('button:first-child').trigger('click')
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Room 5')
      vi.useRealTimers()
    })

    it('wraps back to first page when autoplay reaches last page', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()

      await wrapper.find('button:first-child').trigger('click')
      vi.advanceTimersByTime(6000)
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Room 0')
      vi.useRealTimers()
    })

    it('stops autoplay when toggled off', async () => {
      vi.useFakeTimers()
      const wrapper = createWrapper()

      await wrapper.find('button:first-child').trigger('click')
      await wrapper.find('button:first-child').trigger('click')

      expect((wrapper.vm as unknown as { isAutoPlaying: boolean }).isAutoPlaying).toBe(false)
      vi.useRealTimers()
    })
  })
})
