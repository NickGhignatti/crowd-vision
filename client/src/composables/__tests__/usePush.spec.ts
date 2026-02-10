import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { usePush } from '../usePush'

describe('usePush', () => {
  const MOCK_VAPID_KEY = 'AQID'

  type MockRegistration = {
    pushManager: {
      getSubscription: Mock;
      subscribe: Mock;
    }
  }

  let mockRegistration: MockRegistration

  const createMockSubscription = (keyAsString: string | null = null) => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test' }),
    options: {
      applicationServerKey: keyAsString ? new TextEncoder().encode(keyAsString).buffer : null,
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockRegistration = {
      pushManager: {
        getSubscription: vi.fn(),
        subscribe: vi.fn(),
      },
    }

    Object.defineProperty(global.window, 'PushManager', {
      value: {},
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'Notification', {
      value: { permission: 'default' },
      writable: true,
      configurable: true,
    })

    // Polyfill atob/btoa for Node environment
    if (!global.window.atob) {
      global.window.atob = (str) => Buffer.from(str, 'base64').toString('binary')
      global.window.btoa = (str) => Buffer.from(str, 'binary').toString('base64')
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('correctly detects support', () => {
    const { isSupported } = usePush()
    expect(isSupported.value).toBe(true)
  })

  it('handles unsupported browsers', async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    delete global.window.PushManager

    const { isSupported, subscribe } = usePush()
    expect(isSupported.value).toBe(false)

    await subscribe()
    expect(global.navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('subscribes successfully (New Subscription)', async () => {
    const { subscribe, isSubscribed, permission } = usePush()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicVapidKey: MOCK_VAPID_KEY }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
    global.fetch = fetchMock

    mockRegistration.pushManager.getSubscription.mockResolvedValue(null)
    mockRegistration.pushManager.subscribe.mockResolvedValue(createMockSubscription())

    await subscribe()

    // Assertions
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Check first call (Key Fetch)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/notification/public-key'),
    )

    // Check second call (Subscribe POST)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/notification/subscribe'),
      expect.objectContaining({ method: 'POST' }),
    )

    expect(mockRegistration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    )

    expect(isSubscribed.value).toBe(true)
    expect(permission.value).toBe('granted')
  })

  it('handles Key Mismatch (Resubscribes)', async () => {
    const { subscribe } = usePush()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicVapidKey: 'NEW-KEY' }) })
      .mockResolvedValueOnce({ ok: true })

    const oldSubscription = createMockSubscription('OLD-KEY')
    const newSubscription = createMockSubscription('NEW-KEY')

    mockRegistration.pushManager.getSubscription.mockResolvedValue(oldSubscription)
    mockRegistration.pushManager.subscribe.mockResolvedValue(newSubscription)

    await subscribe()

    expect(oldSubscription.unsubscribe).toHaveBeenCalled()
    expect(mockRegistration.pushManager.subscribe).toHaveBeenCalled()
  })

  it('handles API errors gracefully', async () => {
    const { subscribe, permission } = usePush()

    global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'))

    await subscribe()

    expect(permission.value).toBe('denied')
  })

  it('handles Server Subscription failure', async () => {
    const { subscribe, permission } = usePush()

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicVapidKey: MOCK_VAPID_KEY }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    mockRegistration.pushManager.getSubscription.mockResolvedValue(null)
    mockRegistration.pushManager.subscribe.mockResolvedValue(createMockSubscription())

    await subscribe()

    expect(permission.value).toBe('denied')
  })
})
