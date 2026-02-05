import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelectionDropdown from '@/components/menus/ModelSelectionDropdown.vue'

describe('ModelSelectionDropdown.vue', () => {
  const mockDomainResponse = {
    domain: { name: 'test-domain' },
  }

  const mockBuildingsResponse = [
    { id: 'Building A', rooms: [] },
    { id: 'Building B', rooms: [] },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Set up the user for the first API call
    localStorage.setItem('username', 'TestUser')
  })

  it('fetches data and auto-selects the first model on mount', async () => {
    const fetchMock = vi
      .fn()
      // 1. First call: Get Domain
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDomainResponse,
      })
      // 2. Second call: Get Buildings (using the domain from step 1)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBuildingsResponse,
      })

    global.fetch = fetchMock

    const wrapper = mount(ModelSelectionDropdown)

    await flushPromises()

    // API calls were made correctly
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/auth/domain/TestUser'))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/twin/buildings/test-domain'),
    )

    // First building is displayed in the button
    expect(wrapper.text()).toContain('Building A')

    // Event was emitted automatically with the first building ID
    expect(wrapper.emitted('model-changed')).toBeTruthy()
    expect(wrapper.emitted('model-changed')?.[0]).toEqual(['Building A'])
  })

  it('allows user to open dropdown and select a different model', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockDomainResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockBuildingsResponse })

    const wrapper = mount(ModelSelectionDropdown)
    await flushPromises()

    // Check dropdown is initially closed
    expect(wrapper.find('div[class*="absolute"]').exists()).toBe(false)

    // Click button to open
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('div[class*="absolute"]').exists()).toBe(true)

    // Verify list content
    const options = wrapper.findAll('div[class*="absolute"] button')
    expect(options).toHaveLength(2)
    expect(options[1].text()).toContain('Building B')

    // Select "Building B"
    await options[1].trigger('click')

    // Selection updated
    expect(wrapper.text()).toContain('Building B')

    // New event emitted
    expect(wrapper.emitted('model-changed')).toHaveLength(2)
    expect(wrapper.emitted('model-changed')?.[1]).toEqual(['Building B'])

    // Dropdown closed
    expect(wrapper.find('div[class*="absolute"]').exists()).toBe(false)
  })

  it('handles empty response gracefully', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockDomainResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    const wrapper = mount(ModelSelectionDropdown)
    await flushPromises()

    // Should not crash, just display empty/placeholder
    expect(wrapper.text()).not.toContain('Building A')

    // Should verify we tried to call the APIs
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
