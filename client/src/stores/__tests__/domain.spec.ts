import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain'
import { useAuthStore } from '@/stores/authentication'
import { makeRequest } from '@/composables/useApi'
import type { DomainMembership, Domain } from '@/models/domain'

vi.mock('@/composables/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeMembership = (domainName: string, role = 'standard_customer'): DomainMembership => ({
  domainName,
  role,
})

const makeDomain = (name: string): Domain => ({
  name,
  subdomains: [],
  authStrategy: 'internal',
})

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('useDomainsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Provide a default account name so fetchMemberships can build its URL
    useAuthStore().accountName = 'alice'
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
    it('calls makeRequest with the account-scoped URL', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )

      await useDomainsStore().fetchMemberships()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/alice')
    })

    it('uses the current accountName from the auth store at call time', async () => {
      useAuthStore().accountName = 'bob'
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )

      await useDomainsStore().fetchMemberships()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/bob')
    })

    it('stores the returned domains array on success', async () => {
      const memberships = [makeMembership('acme'), makeMembership('globex')]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: memberships }) as unknown as Response,
      )

      const store = useDomainsStore()
      await store.fetchMemberships()

      expect(store.memberships).toEqual(memberships)
    })

    it('stores an empty array when the response payload has no domains key', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, {}) as unknown as Response)

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
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )
      const store = useDomainsStore()

      const fetch1 = store.fetchMemberships()
      const fetch2 = store.fetchMemberships()
      await Promise.all([fetch1, fetch2])

      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('does not overwrite an existing empty-array cache', async () => {
      // memberships !== null means it IS cached (even if empty)
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
        return makeResponse(true, { domains: [] }) as unknown as Response
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
    it('calls makeRequest with the shared domains endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )

      await useDomainsStore().fetchAll()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains')
    })

    it('stores the returned domains array on success', async () => {
      const domains = [makeDomain('acme'), makeDomain('globex')]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains }) as unknown as Response,
      )

      const store = useDomainsStore()
      await store.fetchAll()

      expect(store.allDomains).toEqual(domains)
    })

    it('stores an empty array when the response payload has no domains key', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, {}) as unknown as Response)

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
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )
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
        return makeResponse(true, { domains: [] }) as unknown as Response
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
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [] }) as unknown as Response,
      )

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
        makeResponse(true, { domains: [makeMembership('acme')] }) as unknown as Response,
      )

      const store = useDomainsStore()
      store.memberships = [makeMembership('globex')]
      store.invalidate()

      await store.fetchMemberships()

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(store.memberships).toEqual([makeMembership('acme')])
    })

    it('allows fetchAll to run again after invalidation', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { domains: [makeDomain('acme')] }) as unknown as Response,
      )

      const store = useDomainsStore()
      store.allDomains = [makeDomain('globex')]
      store.invalidate()

      await store.fetchAll()

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(store.allDomains).toEqual([makeDomain('acme')])
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
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, ['sub1']) as unknown as Response)

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
        makeResponse(true, ['sub1']) as unknown as Response,
      )

      await useSubdomainsStore().fetch([makeMembership('acme'), makeMembership('globex')])

      const urls = vi.mocked(makeRequest).mock.calls.map((c) => c[0])
      expect(urls).toContain('/auth/subdomains/acme')
      expect(urls).toContain('/auth/subdomains/globex')
    })

    it('uses Promise.allSettled — all domains are attempted even when one fetch rejects', async () => {
      vi.mocked(makeRequest)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(makeResponse(true, ['sub1']) as unknown as Response)

      const store = useSubdomainsStore()
      await store.fetch([makeMembership('broken'), makeMembership('acme')])

      // Both keys must be written — allSettled never short-circuits
      expect(store.byDomain).toHaveProperty('broken')
      expect(store.byDomain).toHaveProperty('acme')
    })

    it('stores the returned subdomains under the correct domain key', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, ['sub-a', 'sub-b']) as unknown as Response,
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
        makeResponse(true, ['sub-new']) as unknown as Response,
      )

      const store = useSubdomainsStore()
      store.byDomain = { acme: ['sub-cached'] }

      await store.fetch([makeMembership('acme'), makeMembership('globex')])

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(makeRequest).toHaveBeenCalledWith('/auth/subdomains/globex')
      expect(store.byDomain['acme']).toEqual(['sub-cached']) // untouched
    })

    it('handles a partial failure — successful domains are stored, failed ones get []', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true, ['sub-a']) as unknown as Response)
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
      // Force the outer try block to throw by making allSettled impossible to call
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
        makeResponse(true, ['sub-fresh']) as unknown as Response,
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
