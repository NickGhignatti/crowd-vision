import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationStore } from '@/stores/notification'
import { makeRequest } from '@/composables/core/useApi.ts'
import { NotificationType } from '@/models/notification'

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

/** Minimal Response-like stub accepted by the store actions. */
const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('useNotificationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Suppress expected error-path console output from the store's catch blocks
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty notificationPreferences record', () => {
      const store = useNotificationStore()
      expect(store.notificationPreferences).toEqual({})
    })
  })

  // ── isSubscribed getter ────────────────────────────────────────────────────

  describe('isSubscribed', () => {
    it('returns false for an unknown domain/type pair', () => {
      const store = useNotificationStore()
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)
    })

    it('returns false when the domain exists but the type is absent', () => {
      const store = useNotificationStore()
      store.notificationPreferences = { 'domain-1': {} }
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)
    })

    it('returns the stored boolean when a preference exists', () => {
      const store = useNotificationStore()
      store.notificationPreferences = {
        'domain-1': { [NotificationType.TEMPERATURE]: true },
      }
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(true)
    })

    it('returns false for a known domain when the stored value is false', () => {
      const store = useNotificationStore()
      store.notificationPreferences = {
        'domain-1': { [NotificationType.TEMPERATURE]: false },
      }
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)
    })

    it('defaults to TEMPERATURE type when no type argument is passed', () => {
      const store = useNotificationStore()
      store.notificationPreferences = {
        'domain-1': { [NotificationType.TEMPERATURE]: true },
      }
      expect(store.isSubscribed('domain-1')).toBe(true)
    })
  })

  // ── fetchAccountNotificationPreference ────────────────────────────────────

  describe('fetchAccountNotificationPreference', () => {
    it('calls the notification preferences API with the account name', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences: [] }) as unknown as Response,
      )

      const store = useNotificationStore()
      await store.fetchAccountNotificationPreference('alice')

      expect(makeRequest).toHaveBeenCalledWith('/notification/preferences/alice')
    })

    it('builds a nested domain → type → boolean map from the API response', async () => {
      const accountPreferences = [
        {
          domainName: 'domain-1',
          preferences: [
            { notificationType: NotificationType.TEMPERATURE, isSubscribed: true },
          ],
        },
        {
          domainName: 'domain-2',
          preferences: [
            { notificationType: NotificationType.TEMPERATURE, isSubscribed: false },
          ],
        },
      ]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences }) as unknown as Response,
      )

      const store = useNotificationStore()
      await store.fetchAccountNotificationPreference('alice')

      expect(store.notificationPreferences['domain-1']![NotificationType.TEMPERATURE]).toBe(true)
      expect(store.notificationPreferences['domain-2']![NotificationType.TEMPERATURE]).toBe(false)
    })

    it('handles multiple preference types for the same domain', async () => {
      const accountPreferences = [
        {
          domainName: 'domain-1',
          preferences: [
            { notificationType: NotificationType.TEMPERATURE, isSubscribed: true },
            { notificationType: 'airQuality', isSubscribed: false },
          ],
        },
      ]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences }) as unknown as Response,
      )

      const store = useNotificationStore()
      await store.fetchAccountNotificationPreference('alice')

      expect(store.notificationPreferences['domain-1']![NotificationType.TEMPERATURE]).toBe(true)
      expect(store.notificationPreferences['domain-1']!['airQuality']).toBe(false)
    })

    it('resets notificationPreferences to {} before applying new data', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences: [] }) as unknown as Response,
      )

      const store = useNotificationStore()
      store.notificationPreferences = { 'stale-domain': { temperature: true } }

      await store.fetchAccountNotificationPreference('alice')

      expect(store.notificationPreferences).toEqual({})
    })

    it('does not mutate state when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(false, { type: 'NotFoundError', message: 'Not found' }) as unknown as Response,
      )

      const store = useNotificationStore()
      store.notificationPreferences = { 'existing': { temperature: true } }

      await store.fetchAccountNotificationPreference('unknown-user')

      // The existing preferences must be untouched.
      expect(store.notificationPreferences).toEqual({ 'existing': { temperature: true } })
    })

    it('handles an account with no subscriptions gracefully', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences: [] }) as unknown as Response,
      )

      const store = useNotificationStore()
      await store.fetchAccountNotificationPreference('alice')

      expect(store.notificationPreferences).toEqual({})
    })

    it('handles a subscription with an empty preferences array', async () => {
      const accountPreferences = [{ domainName: 'domain-1', preferences: [] }]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { accountPreferences }) as unknown as Response,
      )

      const store = useNotificationStore()
      await store.fetchAccountNotificationPreference('alice')

      expect(store.notificationPreferences['domain-1']).toEqual({})
    })
  })

  // ── handleNotificationSubscription ────────────────────────────────────────

  describe('handleNotificationSubscription', () => {
    it('sends a POST request with enabled: true when currently unsubscribed', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      // notificationPreferences is empty → isSubscribed returns false
      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      const call = vi.mocked(makeRequest).mock.calls[0]
      expect(call?.[1]).toBe('POST')
      const body = JSON.parse((call?.[2] as any).body)
      expect(body.enabled).toBe(true)
    })

    it('sends a POST request with enabled: false when currently subscribed', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      store.notificationPreferences = {
        'domain-1': { [NotificationType.TEMPERATURE]: true },
      }

      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as any).body,
      )
      expect(body.enabled).toBe(false)
    })

    it('includes accountName, domainName, and type in the request body', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as any).body,
      )
      expect(body.accountName).toBe('alice')
      expect(body.domainName).toBe('domain-1')
      expect(body.type).toBe(NotificationType.TEMPERATURE)
    })

    it('optimistically updates the store to subscribed on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(true)
    })

    it('optimistically updates the store to unsubscribed on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      store.notificationPreferences = {
        'domain-1': { [NotificationType.TEMPERATURE]: true },
      }

      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)
    })

    it('does not mutate state when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(false, { type: 'Error', message: 'Failed' }) as unknown as Response,
      )

      const store = useNotificationStore()
      // Initially not subscribed
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)

      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      // Must remain unsubscribed — no optimistic write on failure
      expect(store.isSubscribed('domain-1', NotificationType.TEMPERATURE)).toBe(false)
    })

    it('creates the domain entry if it does not yet exist', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      // domain-1 is completely absent from the store
      await store.handleNotificationSubscription('alice', 'domain-1', NotificationType.TEMPERATURE)

      expect(store.notificationPreferences['domain-1']).toBeDefined()
      expect(store.notificationPreferences['domain-1']![NotificationType.TEMPERATURE]).toBe(true)
    })

    it('defaults to the TEMPERATURE type when none is specified', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const store = useNotificationStore()
      await store.handleNotificationSubscription('alice', 'domain-1')

      const body = JSON.parse(
        (vi.mocked(makeRequest).mock.calls[0]?.[2] as any).body,
      )
      expect(body.type).toBe(NotificationType.TEMPERATURE)
    })
  })
})
