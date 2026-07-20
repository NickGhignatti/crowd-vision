import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted() runs before vi.mock() factories, making these values safe to reference inside
// the mock — a plain module-scope `const` would be in the temporal dead zone at that point.

const { handlers, mockSocket, capturedIoCall } = vi.hoisted(() => {
  const handlers: Record<string, (...args: unknown[]) => void> = {}

  // Plain object — not a vi.fn(), so mockReset never touches it.
  // Populated once when the service module is first imported.
  const capturedIoCall: { url: string; options: Record<string, unknown> } = {
    url: '',
    options: {},
  }

  const mockSocket = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
    connected: false,
  }

  return { handlers, mockSocket, capturedIoCall }
})

vi.mock('socket.io-client', () => ({
  io: vi.fn((url: string, options: Record<string, unknown>) => {
    capturedIoCall.url = url
    capturedIoCall.options = options
    return mockSocket
  }),
}))

import { socket, socketState } from '@/services/socket'

type IncomingNotification = { message: string; type?: 'info' | 'alert' | 'critical' }

const fireEvent = (event: string, ...args: unknown[]) => {
  handlers[event]?.(...args)
}

const makeIncoming = (overrides: Partial<IncomingNotification> = {}): IncomingNotification => ({
  message: 'Test notification',
  type: 'info',
  ...overrides,
})

describe('socket service', () => {
  // Reset shared socketState before every test so notifications and counters
  // from one test never bleed into the next.
  beforeEach(() => {
    socketState.connected = false
    socketState.notifications = []
    socketState.unreadCount = 0
  })

  describe('initialisation', () => {
    it('creates the socket with autoConnect disabled', () => {
      expect(capturedIoCall.options).toMatchObject({ autoConnect: false })
    })

    it('creates the socket with the websocket transport', () => {
      expect(capturedIoCall.options).toMatchObject({ transports: ['websocket'] })
    })

    it('exports the socket instance returned by io()', () => {
      expect(socket).toBe(mockSocket)
    })

    it('registers handlers for connect, disconnect and notification', () => {
      expect(handlers).toHaveProperty('connect')
      expect(handlers).toHaveProperty('disconnect')
      expect(handlers).toHaveProperty('notification')
    })
  })

  describe('initial socketState', () => {
    it('starts disconnected', () => {
      expect(socketState.connected).toBe(false)
    })

    it('starts with an empty notifications list', () => {
      expect(socketState.notifications).toEqual([])
    })

    it('starts with unreadCount of zero', () => {
      expect(socketState.unreadCount).toBe(0)
    })
  })

  describe('on connect', () => {
    it('sets connected to true', () => {
      fireEvent('connect')
      expect(socketState.connected).toBe(true)
    })

    it('does not affect the notifications list', () => {
      fireEvent('connect')
      expect(socketState.notifications).toEqual([])
    })

    it('does not affect unreadCount', () => {
      fireEvent('connect')
      expect(socketState.unreadCount).toBe(0)
    })
  })

  describe('on disconnect', () => {
    it('sets connected to false', () => {
      socketState.connected = true
      fireEvent('disconnect')
      expect(socketState.connected).toBe(false)
    })

    it('does not affect the notifications list', () => {
      socketState.notifications = [
        {
          id: '1',
          message: 'hello',
          type: 'info',
          timestamp: new Date(),
          read: false,
        },
      ]
      fireEvent('disconnect')
      expect(socketState.notifications).toHaveLength(1)
    })

    it('does not affect unreadCount', () => {
      socketState.unreadCount = 3
      fireEvent('disconnect')
      expect(socketState.unreadCount).toBe(3)
    })
  })

  describe('on notification — stored shape', () => {
    it('prepends the notification to the list (most recent first)', () => {
      fireEvent('notification', makeIncoming({ message: 'first' }))
      fireEvent('notification', makeIncoming({ message: 'second' }))

      expect(socketState.notifications[0]?.message).toBe('second')
      expect(socketState.notifications[1]?.message).toBe('first')
    })

    it('stores the message from the incoming payload', () => {
      fireEvent('notification', makeIncoming({ message: 'Server is restarting' }))
      expect(socketState.notifications[0]?.message).toBe('Server is restarting')
    })

    it('stores the type from the incoming payload', () => {
      fireEvent('notification', makeIncoming({ type: 'critical' }))
      expect(socketState.notifications[0]?.type).toBe('critical')
    })

    it('falls back to "info" when type is omitted', () => {
      fireEvent('notification', { message: 'No type field' })
      expect(socketState.notifications[0]?.type).toBe('info')
    })

    it('generates a string id for each notification', () => {
      fireEvent('notification', makeIncoming())
      expect(typeof socketState.notifications[0]?.id).toBe('string')
      expect(socketState.notifications[0]?.id.length).toBeGreaterThan(0)
    })

    it('derives the id from DateCard.now()', () => {
      const before = Date.now()
      fireEvent('notification', makeIncoming())
      const after = Date.now()

      const id = Number(socketState.notifications[0]?.id)
      expect(id).toBeGreaterThanOrEqual(before)
      expect(id).toBeLessThanOrEqual(after)
    })

    it('stores read as false', () => {
      fireEvent('notification', makeIncoming())
      expect(socketState.notifications[0]?.read).toBe(false)
    })

    it('stores a DateCard instance as the timestamp', () => {
      fireEvent('notification', makeIncoming())
      expect(socketState.notifications[0]?.timestamp).toBeInstanceOf(Date)
    })

    it('sets the timestamp close to the current time', () => {
      const before = Date.now()
      fireEvent('notification', makeIncoming())
      const after = Date.now()

      const ts = socketState.notifications[0]?.timestamp.getTime() ?? 0
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(after)
    })
  })

  describe('on notification — unreadCount', () => {
    it('increments unreadCount by 1 for a single notification', () => {
      fireEvent('notification', makeIncoming())
      expect(socketState.unreadCount).toBe(1)
    })

    it('increments unreadCount for each notification received', () => {
      fireEvent('notification', makeIncoming())
      fireEvent('notification', makeIncoming())
      fireEvent('notification', makeIncoming())
      expect(socketState.unreadCount).toBe(3)
    })

    it('unreadCount matches the length of the notifications list', () => {
      fireEvent('notification', makeIncoming())
      fireEvent('notification', makeIncoming())

      expect(socketState.unreadCount).toBe(socketState.notifications.length)
    })
  })

  describe('on notification — type variants', () => {
    it.each([
      ['info', 'info' as const],
      ['alert', 'alert' as const],
      ['critical', 'critical' as const],
    ])('stores type "%s" correctly', (_, type) => {
      fireEvent('notification', makeIncoming({ type }))
      expect(socketState.notifications[0]?.type).toBe(type)
    })
  })

  describe('connect and disconnect toggling', () => {
    it('reflects repeated connect/disconnect cycles correctly', () => {
      fireEvent('connect')
      expect(socketState.connected).toBe(true)

      fireEvent('disconnect')
      expect(socketState.connected).toBe(false)

      fireEvent('connect')
      expect(socketState.connected).toBe(true)
    })
  })

  describe('notification cap', () => {
    it('caps the stored notifications at 100', () => {
      for (let i = 0; i < 101; i++) fireEvent('notification', makeIncoming({ message: `n${i}` }))
      expect(socketState.notifications).toHaveLength(100)
    })

    it('keeps the most recent and drops the oldest when over the cap', () => {
      for (let i = 0; i < 150; i++) fireEvent('notification', makeIncoming({ message: `n${i}` }))

      // unshift puts the newest at the front; truncation drops the oldest tail.
      expect(socketState.notifications[0]?.message).toBe('n149')
      expect(socketState.notifications.some((n) => n.message === 'n0')).toBe(false)
    })

    it('does not truncate at or below the cap', () => {
      for (let i = 0; i < 100; i++) fireEvent('notification', makeIncoming())
      expect(socketState.notifications).toHaveLength(100)
    })
  })
})
