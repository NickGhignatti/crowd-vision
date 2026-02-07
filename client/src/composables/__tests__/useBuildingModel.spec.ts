import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBuildingModel } from '@/composables/useBuildingModel'

vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('useBuildingModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('username', 'TestUser')
  })

  it('fetchBuildings fetches user domains then buildings', async () => {
    // 1st Call: Auth Domains
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'TestDomain', role: 'viewer' }],
        }),
    })

    // 2nd Call: Buildings for that domain
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'Building1', rooms: [], domains: ['TestDomain'] }]),
    })

    const { fetchBuildings, allBuildings } = useBuildingModel()

    await fetchBuildings()

    // Verification
    expect(fetchMock).toHaveBeenCalledTimes(2)

    if (fetchMock.mock && fetchMock.mock.calls[0] && fetchMock.mock.calls[1]) {
      // Check 1st URL (Auth)
      expect(fetchMock.mock.calls[0][0]).toContain('/auth/domains/TestUser')

      // Check 2nd URL (Twin Service)
      expect(fetchMock.mock.calls[1][0]).toContain('/twin/buildings/TestDomain')
    }
    expect(allBuildings.value).toHaveLength(1)

    if (allBuildings.value[0]) {
      expect(allBuildings.value[0].id).toBe('Building1')
    }
  })
})
