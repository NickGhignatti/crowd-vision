import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelectionDropdown from '../ModelSelectionDropdown.vue'

// Mock environment variables
vi.stubEnv('VITE_SERVER_URL', 'http://test-api')

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('ModelSelectionDropdown.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Simulate a fully authenticated user session
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('username', 'TestUser')
    localStorage.setItem('token', 'mock-jwt-token-123')
  })

  it('fetches data and auto-selects the first model, sending auth headers', async () => {
    // 1st Fetch: Get domains for the user
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'test-domain', role: 'viewer' }],
        }),
    })

    // 2nd Fetch: Get buildings for the selected domain
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'Building A' }]),
    })

    const wrapper = mount(ModelSelectionDropdown)

    // Wait for both sequential fetch calls to resolve
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/twin/buildings/test-domain'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-jwt-token-123',
        }),
      }),
    )

    expect(wrapper.text()).toContain('Building A')
  })

  it('allows user to open dropdown and select a different model', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ domains: [{ domainName: 'd1' }] }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'Building A' }, { id: 'Building B' }]),
    })

    const wrapper = mount(ModelSelectionDropdown)
    await flushPromises()

    const button = wrapper.find('button')
    await button.trigger('click')

    const items = wrapper.findAll('li button')
    expect(items).toHaveLength(2)

    await items[1]?.trigger('click')

    expect(wrapper.emitted('model-changed')).toBeTruthy()
    const emits = wrapper.emitted('model-changed')
    expect(emits?.[emits.length - 1]).toEqual(['Building B'])
  })
})
