import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useUserPermissions } from '../useUserPermissions'
import { useAuthStore } from '@/stores/authentication'

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('useUserPermissions', () => {
  const mountComposable = () => {
    let composable!: ReturnType<typeof useUserPermissions>

    const Host = defineComponent({
      setup() {
        composable = useUserPermissions()
        return () => null
      },
    })

    mount(Host)
    return composable
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ domains: [] }),
    })
    const authStore = useAuthStore()
    authStore.accountName = 'TestAccount'
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initializes with empty memberships', () => {
    const { memberships } = mountComposable()
    expect(memberships.value).toEqual([])
  })

  it('fetches permissions and allows edit if role is business admin', async () => {
    // Account is business admin of 'domain-a'
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'domain-a', role: 'business_admin' }],
        }),
    })

    const { fetchPermissions, canEdit, memberships } = mountComposable()

    await fetchPermissions()

    expect(memberships.value).toHaveLength(1)

    // Check Logic
    expect(canEdit(['domain-a'])).toBe(true)
    expect(canEdit(['domain-b'])).toBe(false) // Not business admin of this one
  })

  it('denies edit if role is standard customer', async () => {
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          domains: [{ domainName: 'domain-a', role: 'standard_customer' }],
        }),
    })

    const { fetchPermissions, canEdit } = mountComposable()
    await fetchPermissions()

    expect(canEdit(['domain-a'])).toBe(false)
  })

  it('handles API errors gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network Error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    const { fetchPermissions, memberships } = mountComposable()
    await fetchPermissions()

    expect(memberships.value).toEqual([])
    expect(consoleSpy).toHaveBeenCalled()
  })
})
