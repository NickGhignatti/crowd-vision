import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelDropdown from '@/components/dropdowns/ModelDropdown.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockFetchMemberships = vi.fn()
let mockMemberships: Array<{ domainName: string; role: string }> | null = null

vi.mock('@/stores/domain.ts', () => ({
  useDomainsStore: () => ({
    fetchMemberships: mockFetchMemberships,
    get memberships() {
      return mockMemberships
    },
  }),
}))

const mockFetchBuildings = vi.fn()
let mockBuildingsAll: Array<{ id: string; name?: string }> = []

vi.mock('@/stores/buildings.ts', () => ({
  useBuildingsStore: () => ({
    fetch: mockFetchBuildings,
    get all() {
      return mockBuildingsAll
    },
  }),
}))

const stubs = {
  Transition: true,
}

describe('ModelDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemberships = [{ domainName: 'acme', role: 'admin' }]
    mockBuildingsAll = [
      { id: 'bldg-1', name: 'Main Campus' },
      { id: 'bldg-2', name: 'West Annex' },
    ]
  })

  describe('initialization and store fetching', () => {
    it('fetches memberships and buildings on mount', async () => {
      mount(ModelDropdown, { global: { stubs } })

      await flushPromises()

      expect(mockFetchMemberships).toHaveBeenCalledTimes(1)
      expect(mockFetchBuildings).toHaveBeenCalledWith(mockMemberships)
    })

    it('does not attempt to fetch buildings if memberships fetch returns null', async () => {
      mockMemberships = null
      mount(ModelDropdown, { global: { stubs } })

      await flushPromises()

      expect(mockFetchMemberships).toHaveBeenCalledTimes(1)
      expect(mockFetchBuildings).not.toHaveBeenCalled()
    })

    it('filters duplicate building IDs and auto-selects the first model', async () => {
      mockBuildingsAll = [
        { id: 'bldg-1', name: 'Main Campus' },
        { id: 'bldg-1', name: 'Main Campus Duplicate' },
        { id: 'bldg-2', name: 'West Annex' },
      ]

      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      // It should automatically emit the first model upon initialization
      expect(wrapper.emitted('model-changed')).toBeTruthy()
      expect(wrapper.emitted('model-changed')?.[0]).toEqual([{ id: 'bldg-1', name: 'Main Campus' }])

      // The main trigger button should now show the selected model's display name
      expect(wrapper.find('button').text()).toContain('Main Campus')
    })

    it('handles errors gracefully during initialization and logs them', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const expectedError = new Error('Network error')

      mockFetchMemberships.mockRejectedValueOnce(expectedError)

      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      // The error should be logged, but the component shouldn't crash
      expect(consoleSpy).toHaveBeenCalledWith('Error initializing models:', expectedError)

      expect(wrapper.emitted('model-changed')).toBeUndefined()

      consoleSpy.mockRestore()
    })
  })

  describe('dropdown behavior and interactions', () => {
    it('toggles the dropdown when the main button is clicked', async () => {
      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      const mainBtn = wrapper.find('button')

      expect(wrapper.find('ul').exists()).toBe(false)

      await mainBtn.trigger('click')
      expect(wrapper.find('ul').exists()).toBe(true)

      await mainBtn.trigger('click')
      expect(wrapper.find('ul').exists()).toBe(false)
    })

    it('displays a fallback message when the building list is empty', async () => {
      mockBuildingsAll = []

      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      await wrapper.find('button').trigger('click')

      expect(wrapper.text()).toContain('model.noBuildings')
      expect(wrapper.findAll('ul li button')).toHaveLength(0)
    })

    it('selects a model, closes the dropdown, and emits when an option is clicked', async () => {
      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      wrapper.emitted('model-changed')?.pop()

      await wrapper.find('button').trigger('click')

      const options = wrapper.findAll('ul li button')
      expect(options).toHaveLength(2)
      await options[1]?.trigger('click')

      expect(wrapper.find('ul').exists()).toBe(false)

      expect(wrapper.emitted('model-changed')).toHaveLength(1)
      expect(wrapper.emitted('model-changed')?.[0]).toEqual([{ id: 'bldg-2', name: 'West Annex' }])

      expect(wrapper.find('button').text()).toContain('West Annex')
    })

    it('closes the dropdown when the transparent backdrop is clicked', async () => {
      const wrapper = mount(ModelDropdown, { global: { stubs } })
      await flushPromises()

      await wrapper.find('button').trigger('click')
      expect(wrapper.find('ul').exists()).toBe(true)

      const backdrop = wrapper.find('.fixed.inset-0.bg-transparent')
      await backdrop.trigger('click')

      expect(wrapper.find('ul').exists()).toBe(false)
    })
  })
})
