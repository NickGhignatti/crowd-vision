import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useUserPermissions } from '../useUserPermissions'
import { useDomainsStore } from '@/stores/domain'

vi.mock('@/composables/useApi', () => ({
  authenticatedFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ domains: [] }),
    }),
  ),
  nonAuthenticatedFetch: vi.fn(),
}))

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
    const domainsStore = useDomainsStore()
    domainsStore.memberships = [{ domainName: 'domain-a', role: 'business_admin' }]

    const { canEdit, memberships } = mountComposable()

    expect(memberships.value).toHaveLength(1)

    // Check Logic
    expect(canEdit(['domain-a'])).toBe(true)
    expect(canEdit(['domain-b'])).toBe(false) // Not business admin of this one
  })

  it('denies edit if role is standard customer', async () => {
    const domainsStore = useDomainsStore()
    domainsStore.memberships = [{ domainName: 'domain-a', role: 'standard_customer' }]

    const { canEdit } = mountComposable()

    expect(canEdit(['domain-a'])).toBe(false)
  })

  it('handles empty memberships gracefully', () => {
    const domainsStore = useDomainsStore()
    domainsStore.memberships = []

    const { memberships } = mountComposable()

    expect(memberships.value).toEqual([])
  })
})
