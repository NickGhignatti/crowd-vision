import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authentication'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain'
import { useBuildingsStore } from '@/stores/buildings'
import { makeRequest } from '@/composables/core/useApi.ts'

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

/** Build a minimal Response-like object accepted by the store actions. */
const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with accountName as null', () => {
      const store = useAuthStore()
      expect(store.accountName).toBeNull()
    })

    it('starts unauthenticated', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
    })

    it('starts not hydrated', () => {
      const store = useAuthStore()
      expect(store.isHydrated).toBe(false)
    })

    it('starts with accountId as null', () => {
      const store = useAuthStore()
      expect(store.accountId).toBeNull()
    })
  })

  describe('completeLogin', () => {
    it('POSTs the id token to the gateway exchange endpoint', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response) // /gateway/exchange
        .mockResolvedValueOnce(makeResponse(true, { accountName: 'alice' }) as unknown as Response) // /gateway/me

      await useAuthStore().completeLogin('raw-id-token')

      expect(makeRequest).toHaveBeenNthCalledWith(1, '/gateway/exchange', 'POST', expect.any(Object))
      const body = JSON.parse((vi.mocked(makeRequest).mock.calls[0]?.[2] as { body: string }).body)
      expect(body).toEqual({ idToken: 'raw-id-token' })
    })

    it('hydrates from /gateway/me after a successful exchange', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, { accountName: 'alice' }) as unknown as Response)

      const store = useAuthStore()
      await store.completeLogin('raw-id-token')

      expect(store.accountName).toBe('alice')
      expect(store.isAuthenticated).toBe(true)
    })

    it('returns true on success', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, { accountName: 'alice' }) as unknown as Response)

      await expect(useAuthStore().completeLogin('raw-id-token')).resolves.toBe(true)
    })

    it('returns false and does not hydrate when the exchange fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      const store = useAuthStore()
      const ok = await store.completeLogin('bad-token')

      expect(ok).toBe(false)
      expect(makeRequest).toHaveBeenCalledTimes(1) // never reached /gateway/me
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    beforeEach(() => {
      const store = useAuthStore()
      store.accountName = 'alice'
      store.isAuthenticated = true
    })

    it('calls the gateway logout endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      await useAuthStore().logout()

      expect(makeRequest).toHaveBeenCalledWith('/gateway/logout', 'POST')
    })

    it('clears accountName', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useAuthStore()
      await store.logout()

      expect(store.accountName).toBeNull()
    })

    it('clears accountId', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useAuthStore()
      store.accountId = 'sub-123'
      await store.logout()

      expect(store.accountId).toBeNull()
    })

    it('sets isAuthenticated to false', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useAuthStore()
      await store.logout()

      expect(store.isAuthenticated).toBe(false)
    })

    it('resets the domains, buildings, and subdomains stores', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'acme', role: 'admin' }]
      const buildingsStore = useBuildingsStore()
      buildingsStore.byDomain = { acme: [] }
      const subdomainsStore = useSubdomainsStore()
      subdomainsStore.byDomain = { acme: ['sub1'] }

      await useAuthStore().logout()

      expect(domainsStore.memberships).toBeNull()
      expect(buildingsStore.byDomain).toEqual({})
      expect(subdomainsStore.byDomain).toEqual({})
    })

    it('propagates fetch errors without swallowing them', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      await expect(useAuthStore().logout()).rejects.toThrow('Network error')
    })

    it('does not clear state when fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useAuthStore()
      await store.logout().catch(() => {})

      expect(store.accountName).toBe('alice')
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('hydrate', () => {
    it('calls makeRequest with the gateway /me endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      await useAuthStore().hydrate()

      expect(makeRequest).toHaveBeenCalledWith('/gateway/me')
    })

    it('sets accountName from the response on a successful call', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.hydrate()

      expect(store.accountName).toBe('alice')
    })

    it('sets accountId from the sub claim on a successful call', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice', sub: 'sub-123' }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.hydrate()

      expect(store.accountId).toBe('sub-123')
    })

    it('clears accountId when the response is not ok', async () => {
      const store = useAuthStore()
      store.accountId = 'sub-123'
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      await store.hydrate(true)

      expect(store.accountId).toBeNull()
    })

    it('marks the user as authenticated on a successful call', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isAuthenticated).toBe(true)
    })

    it('always sets isHydrated to true on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isHydrated).toBe(true)
    })

    it('does not set isAuthenticated when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isAuthenticated).toBe(false)
      expect(store.accountName).toBeNull()
    })

    it('still sets isHydrated to true even when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isHydrated).toBe(true)
    })

    it('does not throw when fetch rejects (expired or missing cookie)', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      await expect(useAuthStore().hydrate()).resolves.toBeUndefined()
    })

    it('leaves isAuthenticated false when fetch rejects', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isAuthenticated).toBe(false)
      expect(store.accountName).toBeNull()
    })

    it('still sets isHydrated to true even when fetch rejects', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useAuthStore()
      await store.hydrate()

      expect(store.isHydrated).toBe(true)
    })

    it('force=true re-runs the check even when already hydrated', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )
      const store = useAuthStore()
      await store.hydrate()
      vi.clearAllMocks()

      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'bob' }) as unknown as Response,
      )
      await store.hydrate(true)

      expect(makeRequest).toHaveBeenCalledWith('/gateway/me')
      expect(store.accountName).toBe('bob')
    })

    it('without force, a second call after hydration is a no-op', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )
      const store = useAuthStore()
      await store.hydrate()
      vi.clearAllMocks()

      await store.hydrate()

      expect(makeRequest).not.toHaveBeenCalled()
    })
  })
})
