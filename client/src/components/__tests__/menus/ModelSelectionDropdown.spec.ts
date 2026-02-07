import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelectionDropdown from '@/components/menus/ModelSelectionDropdown.vue'

vi.stubEnv('VITE_SERVER_URL', 'http://test-api')

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('ModelSelectionDropdown.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('username', 'TestUser')
  })

  it('fetches data and auto-selects the first model', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'test-domain', role: 'viewer' }],
        }),
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'Building A' }]),
    })

    const wrapper = mount(ModelSelectionDropdown)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/twin/buildings/test-domain'))
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
    await button.trigger('click') // Open

    const items = wrapper.findAll('li button')
    expect(items).toHaveLength(2)

    await items[1].trigger('click') // Select 'Building B'

    expect(wrapper.emitted('model-changed')).toBeTruthy()
    const emits = wrapper.emitted('model-changed')
    expect(emits?.[emits.length - 1]).toEqual(['Building B'])
  })
})
