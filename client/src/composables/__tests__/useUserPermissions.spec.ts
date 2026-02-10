import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUserPermissions } from '../useUserPermissions'

vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('useUserPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('username', 'TestUser')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initializes with empty memberships', () => {
    const { memberships } = useUserPermissions()
    expect(memberships.value).toEqual([])
  })

  it('fetches permissions and allows edit if role is admin/owner', async () => {
    // User is admin of 'domain-a'
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'domain-a', role: 'admin' }],
        }),
    })

    const { fetchPermissions, canEdit, memberships } = useUserPermissions()

    await fetchPermissions()

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/auth/domains/TestUser')
    expect(memberships.value).toHaveLength(1)

    // Check Logic
    expect(canEdit(['domain-a'])).toBe(true)
    expect(canEdit(['domain-b'])).toBe(false) // Not admin of this one
  })

  it('denies edit if role is viewer', async () => {
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'domain-a', role: 'viewer' }],
        }),
    })

    const { fetchPermissions, canEdit } = useUserPermissions()
    await fetchPermissions()

    expect(canEdit(['domain-a'])).toBe(false)
  })

  it('handles API errors gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network Error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    const { fetchPermissions, memberships } = useUserPermissions()
    await fetchPermissions()

    expect(memberships.value).toEqual([])
    expect(consoleSpy).toHaveBeenCalled()
  })
})
