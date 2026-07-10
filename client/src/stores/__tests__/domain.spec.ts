import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain'
import { useAuthStore } from '@/stores/authentication'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { DomainMembership, Domain } from '@/models/domain'

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeMembership = (domainName: string, role = 'standard_customer'): DomainMembership => ({
  domainName,
  role,
})

const makeDomain = (name: string, overrides: Partial<Domain> = {}): Domain => ({
  id: `id-${name}`,
  name,
  displayName: name,
  joinPolicy: 'invite-only',
  isPublic: true,
  ...overrides,
})

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
  text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
})

describe('useDomainsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    useAuthStore().accountName = 'alice'
    useAuthStore().accountId = 'acc-alice'
  })

  describe('initial state', () => {
    it('starts with memberships as null', () => {
      expect(useDomainsStore().memberships).toBeNull()
    })

    it('starts with allDomains as null', () => {
      expect(useDomainsStore().allDomains).toBeNull()
    })

    it('starts with loading false', () => {
      expect(useDomainsStore().loading).toBe(false)
    })

    it('starts with loadingAll false', () => {
      expect(useDomainsStore().loadingAll).toBe(false)
    })
  })

  describe('fetchMemberships', () => {
    it('calls makeRequest with the my-memberships endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().fetchMemberships()

      expect(makeRequest).toHaveBeenCalledWith('/tenancy/me/memberships')
    })

    it('maps the domain field to domainName', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ domain: 'acme', role: 'business_admin' }]) as unknown as Response,
      )

      const store = useDomainsStore()
      await store.fetchMemberships()

      expect(store.memberships).toEqual([{ domainName: 'acme', role: 'business_admin', externalId: undefined }])
    })

    it('carries externalId through when present', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [
          { domain: 'unibo', role: 'standard_customer', externalId: 'eppn:mario@unibo.it' },
        ]) as unknown as Response,
      )

      const store = useDomainsStore()
      await store.fetchMemberships()

      expect(store.memberships?.[0]?.externalId).toBe('eppn:mario@unibo.it')
    })

    it('stores an empty array on a non-ok response', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useDomainsStore()
      await store.fetchMemberships()

      expect(store.memberships).toEqual([])
    })

    it('does not call makeRequest when memberships are already cached', async () => {
      const store = useDomainsStore()
      store.memberships = [makeMembership('acme')]

      await store.fetchMemberships()

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('only calls makeRequest once when multiple fetches happen concurrently', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)
      const store = useDomainsStore()

      const fetch1 = store.fetchMemberships()
      const fetch2 = store.fetchMemberships()
      await Promise.all([fetch1, fetch2])

      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('does not overwrite an existing empty-array cache', async () => {
      const store = useDomainsStore()
      store.memberships = []

      await store.fetchMemberships()

      expect(makeRequest).not.toHaveBeenCalled()
      expect(store.memberships).toEqual([])
    })

    it('sets loading to true during the fetch and false afterwards', async () => {
      const loadingDuringFetch: boolean[] = []

      vi.mocked(makeRequest).mockImplementation(async () => {
        loadingDuringFetch.push(useDomainsStore().loading)
        return makeResponse(true, []) as unknown as Response
      })

      const store = useDomainsStore()
      await store.fetchMemberships()

      expect(loadingDuringFetch).toContain(true)
      expect(store.loading).toBe(false)
    })

    it('resets loading to false when fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useDomainsStore()
      await store.fetchMemberships().catch(() => {})

      expect(store.loading).toBe(false)
    })

    it('leaves memberships as null when fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useDomainsStore()
      await store.fetchMemberships().catch(() => {})

      expect(store.memberships).toBeNull()
    })
  })

  describe('fetchAll', () => {
    it('calls makeRequest with the tenancy domains endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().fetchAll()

      expect(makeRequest).toHaveBeenCalledWith('/tenancy/domains')
    })

    it('stores the returned domains array on success', async () => {
      const domains = [makeDomain('acme'), makeDomain('globex')]
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, domains) as unknown as Response)

      const store = useDomainsStore()
      await store.fetchAll()

      expect(store.allDomains).toEqual(domains)
    })

    it('stores an empty array on a non-ok response', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useDomainsStore()
      await store.fetchAll()

      expect(store.allDomains).toEqual([])
    })

    it('does not call makeRequest when allDomains is already cached', async () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme')]

      await store.fetchAll()

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('only calls makeRequest once when multiple fetchAll happen concurrently', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)
      const store = useDomainsStore()

      const fetch1 = store.fetchAll()
      const fetch2 = store.fetchAll()
      await Promise.all([fetch1, fetch2])

      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('does not overwrite an existing empty-array cache', async () => {
      const store = useDomainsStore()
      store.allDomains = []

      await store.fetchAll()

      expect(makeRequest).not.toHaveBeenCalled()
      expect(store.allDomains).toEqual([])
    })

    it('sets loadingAll to true during the fetch and false afterwards', async () => {
      const loadingDuringFetch: boolean[] = []

      vi.mocked(makeRequest).mockImplementation(async () => {
        loadingDuringFetch.push(useDomainsStore().loadingAll)
        return makeResponse(true, []) as unknown as Response
      })

      const store = useDomainsStore()
      await store.fetchAll()

      expect(loadingDuringFetch).toContain(true)
      expect(store.loadingAll).toBe(false)
    })

    it('resets loadingAll to false when fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useDomainsStore()
      await store.fetchAll().catch(() => {})

      expect(store.loadingAll).toBe(false)
    })

    it('leaves allDomains as null when fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useDomainsStore()
      await store.fetchAll().catch(() => {})

      expect(store.allDomains).toBeNull()
    })

    it('does not interfere with fetchMemberships loading flag', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)

      const store = useDomainsStore()
      await store.fetchAll()

      expect(store.loading).toBe(false)
    })
  })

  describe('invalidate', () => {
    it('sets memberships back to null', () => {
      const store = useDomainsStore()
      store.memberships = [makeMembership('acme')]

      store.invalidate()

      expect(store.memberships).toBeNull()
    })

    it('sets allDomains back to null', () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme')]

      store.invalidate()

      expect(store.allDomains).toBeNull()
    })

    it('invalidates both caches in a single call', () => {
      const store = useDomainsStore()
      store.memberships = [makeMembership('acme')]
      store.allDomains = [makeDomain('acme')]

      store.invalidate()

      expect(store.memberships).toBeNull()
      expect(store.allDomains).toBeNull()
    })

    it('allows fetchMemberships to run again after invalidation', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ domain: 'acme', role: 'standard_customer' }]) as unknown as Response,
      )

      const store = useDomainsStore()
      store.memberships = [makeMembership('globex')]
      store.invalidate()

      await store.fetchMemberships()

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(store.memberships).toEqual([makeMembership('acme')])
    })

    it('allows fetchAll to run again after invalidation', async () => {
      const domains = [makeDomain('acme')]
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, domains) as unknown as Response)

      const store = useDomainsStore()
      store.allDomains = [makeDomain('globex')]
      store.invalidate()

      await store.fetchAll()

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(store.allDomains).toEqual(domains)
    })

    it('clears member and building counts', () => {
      const store = useDomainsStore()
      store.memberCounts = { acme: 3 }
      store.buildingCounts = { acme: 2 }

      store.invalidate()

      expect(store.memberCounts).toEqual({})
      expect(store.buildingCounts).toEqual({})
    })
  })

  describe('fetchMemberCounts', () => {
    it('derives counts from allDomains without a network call', async () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme', { memberCount: 4 }), makeDomain('globex', { memberCount: 1 })]

      await store.fetchMemberCounts()

      expect(makeRequest).not.toHaveBeenCalled()
      expect(store.memberCounts).toEqual({ acme: 4, globex: 1 })
    })

    it('defaults an unset memberCount to 0', async () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme')]

      await store.fetchMemberCounts()

      expect(store.memberCounts).toEqual({ acme: 0 })
    })

    it('produces an empty map when allDomains is null', async () => {
      const store = useDomainsStore()

      await store.fetchMemberCounts()

      expect(store.memberCounts).toEqual({})
    })
  })

  describe('fetchBuildingCounts', () => {
    it('POSTs the explicit name list and stores the map', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { counts: { acme: 2 } }) as unknown as Response,
      )

      const store = useDomainsStore()
      await store.fetchBuildingCounts(['acme', 'globex'])

      expect(makeRequest).toHaveBeenCalledWith('/twin/buildings/counts', 'POST', {
        body: JSON.stringify({ domains: ['acme', 'globex'] }),
      })
      expect(store.buildingCounts).toEqual({ acme: 2 })
    })

    it('skips the request when the name list is empty', async () => {
      const store = useDomainsStore()
      await store.fetchBuildingCounts([])

      expect(makeRequest).not.toHaveBeenCalled()
      expect(store.buildingCounts).toEqual({})
    })

    it('defaults to an empty map when the request throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useDomainsStore()
      await store.fetchBuildingCounts(['acme'])

      expect(store.buildingCounts).toEqual({})
    })
  })

  describe('createNewDomain', () => {
    it('POSTs a top-level domain to /tenancy/domains', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, makeDomain('acme')) as unknown as Response,
      )

      await useDomainsStore().createNewDomain({
        name: 'Acme',
        isVisibleFromOutside: true,
      })

      expect(makeRequest).toHaveBeenCalledWith('/tenancy/domains', 'POST', {
        body: JSON.stringify({ name: 'acme', displayName: 'acme', isPublic: true }),
      })
    })

    it('POSTs a subdomain to /tenancy/domains/{master}/subdomains when masterDomain is set', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, makeDomain('eng.acme')) as unknown as Response,
      )

      await useDomainsStore().createNewDomain({
        name: 'eng',
        masterDomain: 'acme',
        isVisibleFromOutside: false,
      })

      expect(makeRequest).toHaveBeenCalledWith('/tenancy/domains/acme/subdomains', 'POST', {
        body: JSON.stringify({ name: 'eng.acme', displayName: 'eng.acme', isPublic: false }),
      })
    })

    it('does not double-append the master suffix when already present', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, makeDomain('eng.acme')) as unknown as Response,
      )

      await useDomainsStore().createNewDomain({
        name: 'eng.acme',
        masterDomain: 'acme',
        isVisibleFromOutside: false,
      })

      expect(makeRequest).toHaveBeenCalledWith('/tenancy/domains/acme/subdomains', 'POST', {
        body: JSON.stringify({ name: 'eng.acme', displayName: 'eng.acme', isPublic: false }),
      })
    })

    it('throws using the plain-text error body on failure', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(false, 'domain name is already taken') as unknown as Response,
      )

      await expect(
        useDomainsStore().createNewDomain({
          name: 'acme',
          isVisibleFromOutside: false,
        }),
      ).rejects.toThrow('domain name is already taken')
    })

    it('falls back to a generic message when the error body is empty', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, '') as unknown as Response)

      await expect(
        useDomainsStore().createNewDomain({
          name: 'acme',
          isVisibleFromOutside: false,
        }),
      ).rejects.toThrow('Failed to create domain')
    })
  })

  describe('subscribeToDomain', () => {
    it('POSTs to the join endpoint as standard_customer', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response) // join
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response) // fetchMemberships refresh

      await useDomainsStore().subscribeToDomain({ name: 'unibo' })

      expect(makeRequest).toHaveBeenNthCalledWith(1, '/tenancy/domains/unibo/join', 'POST', {
        body: JSON.stringify({ role: 'standard_customer' }),
      })
    })

    it('refreshes memberships after a successful join', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().subscribeToDomain({ name: 'unibo' })

      expect(makeRequest).toHaveBeenCalledTimes(2)
      expect(makeRequest).toHaveBeenNthCalledWith(2, '/tenancy/me/memberships')
    })

    it('throws when the join fails and does not refresh memberships', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(useDomainsStore().subscribeToDomain({ name: 'unibo' })).rejects.toThrow(
        'Failed to subscribe to unibo',
      )
      expect(makeRequest).toHaveBeenCalledTimes(1)
    })
  })

  describe('unsubscribeFromDomain', () => {
    it('DELETEs the caller-own membership using accountId from the auth store', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().unsubscribeFromDomain('unibo')

      expect(makeRequest).toHaveBeenNthCalledWith(
        1,
        '/tenancy/domains/unibo/members/acc-alice',
        'DELETE',
      )
    })

    it('refreshes memberships after a successful unsubscribe', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().unsubscribeFromDomain('unibo')

      expect(makeRequest).toHaveBeenCalledTimes(2)
    })

    it('throws when accountId is missing from the auth store', async () => {
      useAuthStore().accountId = null

      await expect(useDomainsStore().unsubscribeFromDomain('unibo')).rejects.toThrow(
        'Missing account id in auth store',
      )
      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('throws when the request fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(useDomainsStore().unsubscribeFromDomain('unibo')).rejects.toThrow(
        'Failed to unsubscribe from unibo',
      )
    })
  })

  describe('getDomainQRs', () => {
    it('mints one invite code per invitable role and returns them keyed by role', async () => {
      vi.mocked(makeRequest).mockImplementation(async (_url, _method, options) => {
        const { role } = JSON.parse((options as { body: string }).body)
        return makeResponse(true, { code: `code-${role}` }) as unknown as Response
      })

      const codes = await useDomainsStore().getDomainQRs('acme')

      expect(codes).toEqual({
        business_admin: 'code-business_admin',
        business_staff: 'code-business_staff',
        standard_customer: 'code-standard_customer',
      })
    })

    it('omits a role whose request fails, keeping the others', async () => {
      vi.mocked(makeRequest).mockImplementation(async (_url, _method, options) => {
        const { role } = JSON.parse((options as { body: string }).body)
        if (role === 'business_admin') return makeResponse(false) as unknown as Response
        return makeResponse(true, { code: `code-${role}` }) as unknown as Response
      })

      const codes = await useDomainsStore().getDomainQRs('acme')

      expect(codes).not.toHaveProperty('business_admin')
      expect(codes.business_staff).toBe('code-business_staff')
      expect(codes.standard_customer).toBe('code-standard_customer')
    })

    it('returns an empty map instead of throwing when every role fails', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      await expect(useDomainsStore().getDomainQRs('acme')).resolves.toEqual({})
    })
  })

  describe('redeemInviteCode', () => {
    it('POSTs to the redeem endpoint and refreshes memberships on success', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response) // redeem
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response) // fetchMemberships refresh

      await useDomainsStore().redeemInviteCode('abc123')

      expect(makeRequest).toHaveBeenNthCalledWith(1, '/tenancy/invite-codes/abc123/redeem', 'POST')
      expect(makeRequest).toHaveBeenNthCalledWith(2, '/tenancy/me/memberships')
    })

    it('trims and URL-encodes the code', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, []) as unknown as Response)

      await useDomainsStore().redeemInviteCode('  weird code/slash  ')

      expect(makeRequest).toHaveBeenNthCalledWith(
        1,
        '/tenancy/invite-codes/weird%20code%2Fslash/redeem',
        'POST',
      )
    })

    it('throws using the plain-text error body and does not refresh memberships', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(false, 'invite code is invalid, already redeemed, or expired') as unknown as Response,
      )

      await expect(useDomainsStore().redeemInviteCode('bad-code')).rejects.toThrow(
        'invite code is invalid, already redeemed, or expired',
      )
      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('falls back to a generic message when the error body is empty', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false, '') as unknown as Response)

      await expect(useDomainsStore().redeemInviteCode('bad-code')).rejects.toThrow(
        'Failed to redeem invite code',
      )
    })
  })

  describe('unifiedDomains getter', () => {
    it('merges public domains with private memberships and overlays role + counts', () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme'), makeDomain('globex')]
      store.memberships = [makeMembership('acme', 'business_admin'), makeMembership('secret')]
      store.memberCounts = { acme: 4, secret: 1 }
      store.buildingCounts = { acme: 2 }

      const rows = store.unifiedDomains

      const acme = rows.find((r) => r.name === 'acme')!
      expect(acme.isPrivate).toBe(false)
      expect(acme.isSubscribed).toBe(true)
      expect(acme.role).toBe('business_admin')
      expect(acme.memberCount).toBe(4)
      expect(acme.buildingCount).toBe(2)

      const globex = rows.find((r) => r.name === 'globex')!
      expect(globex.isSubscribed).toBe(false)
      expect(globex.role).toBeUndefined()

      const secret = rows.find((r) => r.name === 'secret')!
      expect(secret.isPrivate).toBe(true)
      expect(secret.isSubscribed).toBe(true)
      expect(secret.role).toBe('standard_customer')
      expect(secret.memberCount).toBe(1)
    })

    it('does not duplicate a public domain the user has joined', () => {
      const store = useDomainsStore()
      store.allDomains = [makeDomain('acme')]
      store.memberships = [makeMembership('acme', 'business_staff')]

      const rows = store.unifiedDomains

      expect(rows.filter((r) => r.name === 'acme')).toHaveLength(1)
      expect(rows[0]?.role).toBe('business_staff')
    })
  })
})

describe('useSubdomainsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with an empty byDomain map', () => {
      expect(useSubdomainsStore().byDomain).toEqual({})
    })

    it('starts with loading false', () => {
      expect(useSubdomainsStore().loading).toBe(false)
    })
  })

  describe('fetch', () => {
    it('does not call makeRequest when already loading', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ name: 'sub1' }]) as unknown as Response,
      )

      const store = useSubdomainsStore()
      const memberships = [makeMembership('acme')]

      const fetch1 = store.fetch(memberships)
      const fetch2 = store.fetch(memberships)
      await Promise.all([fetch1, fetch2])

      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('does not call makeRequest when all memberships are already cached', async () => {
      const store = useSubdomainsStore()
      store.byDomain = { acme: ['sub1'] }

      await store.fetch([makeMembership('acme')])

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('does not call makeRequest when the memberships list is empty', async () => {
      await useSubdomainsStore().fetch([])

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('calls makeRequest with the correct URL for each missing domain', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ name: 'sub1' }]) as unknown as Response,
      )

      await useSubdomainsStore().fetch([makeMembership('acme'), makeMembership('globex')])

      const urls = vi.mocked(makeRequest).mock.calls.map((c) => c[0])
      expect(urls).toContain('/tenancy/domains/acme/subdomains')
      expect(urls).toContain('/tenancy/domains/globex/subdomains')
    })

    it('uses Promise.allSettled — all domains are attempted even when one fetch rejects', async () => {
      vi.mocked(makeRequest)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(makeResponse(true, [{ name: 'sub1' }]) as unknown as Response)

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('broken'), makeMembership('acme')])

      expect(store.byDomain).toHaveProperty('broken')
      expect(store.byDomain).toHaveProperty('acme')
    })

    it('stores the returned subdomain names under the correct domain key', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ name: 'sub-a' }, { name: 'sub-b' }]) as unknown as Response,
      )

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual(['sub-a', 'sub-b'])
    })

    it('stores an empty array when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual([])
    })

    it('stores an empty array when an individual fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual([])
    })

    it('does not re-fetch domains already present in the cache', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ name: 'sub-new' }]) as unknown as Response,
      )

      const store = useSubdomainsStore()
      store.byDomain = { acme: ['sub-cached'] }

      await store.fetch([makeMembership('acme'), makeMembership('globex')])

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(makeRequest).toHaveBeenCalledWith('/tenancy/domains/globex/subdomains')
      expect(store.byDomain['acme']).toEqual(['sub-cached'])
    })

    it('handles a partial failure — successful domains are stored, failed ones get []', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true, [{ name: 'sub-a' }]) as unknown as Response)
        .mockRejectedValueOnce(new Error('Network error'))

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme'), makeMembership('broken')])

      expect(store.byDomain['acme']).toEqual(['sub-a'])
      expect(store.byDomain['broken']).toEqual([])
    })

    it('sets loading to true during the fetch and false afterwards', async () => {
      const loadingDuringFetch: boolean[] = []

      vi.mocked(makeRequest).mockImplementation(async () => {
        loadingDuringFetch.push(useSubdomainsStore().loading)
        return makeResponse(true, []) as unknown as Response
      })

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme')])

      expect(loadingDuringFetch).toContain(true)
      expect(store.loading).toBe(false)
    })

    it('resets loading to false even when Promise.allSettled itself throws', async () => {
      const original = Promise.allSettled
      vi.spyOn(Promise, 'allSettled').mockRejectedValueOnce(new Error('allSettled failed'))

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('acme')]).catch(() => {})

      expect(store.loading).toBe(false)

      Promise.allSettled = original
    })
  })

  describe('invalidate', () => {
    it('clears all cached subdomains', () => {
      const store = useSubdomainsStore()
      store.byDomain = { acme: ['sub1'], globex: ['sub2'] }

      store.invalidate()

      expect(store.byDomain).toEqual({})
    })

    it('does not affect the loading flag', () => {
      const store = useSubdomainsStore()
      store.loading = false

      store.invalidate()

      expect(store.loading).toBe(false)
    })

    it('allows fetch to run again after invalidation', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [{ name: 'sub-fresh' }]) as unknown as Response,
      )

      const store = useSubdomainsStore()
      store.byDomain = { acme: ['sub-stale'] }
      store.invalidate()

      await store.fetch([makeMembership('acme')])

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(store.byDomain['acme']).toEqual(['sub-fresh'])
    })
  })
})
