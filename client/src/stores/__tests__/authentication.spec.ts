import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authentication'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain'
import { useBuildingsStore } from '@/stores/buildings'
import { makeRequest } from '@/composables/core/useApi.ts'

vi.mock('@/composables/useApi', () => ({
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
  })

  describe('login', () => {
    it('calls nonAuthenticatedFetch with the login endpoint and POST method', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'alice' } }) as unknown as Response,
      )

      await useAuthStore().login('alice', 'secret')

      expect(makeRequest).toHaveBeenCalledWith('/auth/login', 'POST', expect.any(Object))
    })

    it('sends accountName and password serialized as JSON in the body', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'alice' } }) as unknown as Response,
      )

      await useAuthStore().login('alice', 'secret')

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as { body: string }).body,
      )
      expect(body).toEqual({ accountName: 'alice', password: 'secret' })
    })

    it('sets accountName from the response payload on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'alice' } }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.login('alice', 'secret')

      expect(store.accountName).toBe('alice')
    })

    it('marks the user as authenticated on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'alice' } }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.login('alice', 'secret')

      expect(store.isAuthenticated).toBe(true)
    })

    it('throws when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(false, {
          type: 'AuthError',
          message: 'User already exists',
        }) as unknown as Response,
      )
      await expect(
        useAuthStore().login('bob', 'pass'),
      ).resolves.toBeUndefined()

    })

    it('does not mutate state when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useAuthStore()
      await store.login('alice', 'wrong').catch(() => {})

      expect(store.accountName).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('register', () => {
    it('calls nonAuthenticatedFetch with the register endpoint and POST method', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      await useAuthStore().register('bob', 'bob@example.com', 'pass')

      expect(makeRequest).toHaveBeenCalledWith(
        '/auth/register',
        'POST',
        expect.any(Object),
      )
    })

    it('sends accountName, email and password in the body', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      await useAuthStore().register('bob', 'bob@example.com', 'pass')

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as { body: string }).body,
      )
      expect(body).toEqual({ accountName: 'bob', email: 'bob@example.com', password: 'pass' })
    })

    it('includes otp in the payload when provided', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      await useAuthStore().register('bob', 'bob@example.com', 'pass', '123456')

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as { body: string }).body,
      )
      expect(body.otp).toBe('123456')
    })

    it('omits otp from the payload when not provided', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      await useAuthStore().register('bob', 'bob@example.com', 'pass')

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as { body: string }).body,
      )
      expect(body).not.toHaveProperty('otp')
    })

    it('sets accountName from the response payload on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.register('bob', 'bob@example.com', 'pass')

      expect(store.accountName).toBe('bob')
    })

    it('marks the user as authenticated on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { account: { accountName: 'bob' } }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.register('bob', 'bob@example.com', 'pass')

      expect(store.isAuthenticated).toBe(true)
    })

    it('throws when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(false, {
          type: 'AuthError',
          message: 'User already exists',
        }) as unknown as Response,
      )
      await expect(
        useAuthStore().register('bob', 'bob@example.com', 'pass'),
      ).resolves.toBeUndefined()
    })

    it('does not mutate state when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useAuthStore()
      await store.register('bob', 'bob@example.com', 'pass').catch(() => {})

      expect(store.accountName).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    beforeEach(() => {
      // Pre-load an authenticated session
      const store = useAuthStore()
      store.accountName = 'alice'
      store.isAuthenticated = true
    })

    it('calls authenticatedFetch with the logout endpoint and POST method', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      await useAuthStore().logout()

      expect(makeRequest).toHaveBeenCalledWith('/auth/logout', 'POST')
    })

    it('clears accountName', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useAuthStore()
      await store.logout()

      expect(store.accountName).toBeNull()
    })

    it('sets isAuthenticated to false', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useAuthStore()
      await store.logout()

      expect(store.isAuthenticated).toBe(false)
    })

    it('resets the domains store', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'acme', role: 'admin' }]

      await useAuthStore().logout()

      expect(domainsStore.memberships).toBeNull()
    })

    it('resets the buildings store', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const buildingsStore = useBuildingsStore()
      buildingsStore.byDomain = { acme: [] }

      await useAuthStore().logout()

      expect(buildingsStore.byDomain).toEqual({})
    })

    it('resets the subdomains store', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const subdomainsStore = useSubdomainsStore()
      subdomainsStore.byDomain = { acme: ['sub1'] }

      await useAuthStore().logout()

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

      // State is unchanged because the throw aborted execution before the resets
      expect(store.accountName).toBe('alice')
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('hydrate', () => {
    it('calls authenticatedFetch with the /auth/me endpoint', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      await useAuthStore().hydrate()

      expect(makeRequest).toHaveBeenCalledWith('/auth/me')
    })

    it('sets accountName from the response on a successful call', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountName: 'alice' }) as unknown as Response,
      )

      const store = useAuthStore()
      await store.hydrate()

      expect(store.accountName).toBe('alice')
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
  })
})
