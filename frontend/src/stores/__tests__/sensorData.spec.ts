import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSensorDataStore } from '@/stores/sensorData.ts'
import { makeRequest } from '@/composables/core/useApi.ts'

// A fake socket that records its event handlers so a test can fire 'telemetry'/'connect',
// and records emits so we can assert subscribe/unsubscribe.
const { socketMock, socketHandlers } = vi.hoisted(() => {
  const socketHandlers: Record<string, (...args: unknown[]) => void> = {}
  const socketMock = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      socketHandlers[event] = cb
    }),
    off: vi.fn(),
    emit: vi.fn(),
  }
  return { socketMock, socketHandlers }
})

vi.mock('@/services/socket', () => ({ socket: socketMock }))
vi.mock('@/composables/core/useApi', () => ({ makeRequest: vi.fn() }))

const makeResponse = (ok: boolean, body: unknown = { data: [] }) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

const fireTelemetry = (event: unknown) => socketHandlers['telemetry']?.(event)
const fireConnect = () => socketHandlers['connect']?.()
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useSensorDataStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    for (const k of Object.keys(socketHandlers)) delete socketHandlers[k]
    // Run rAF callbacks synchronously so the triggerRef flush is deterministic.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('acquire', () => {
    it('fetches the building once and joins its socket room', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { data: [{ roomId: 'r1', value: 21 }] }) as unknown as Response,
      )
      const store = useSensorDataStore()

      const bucket = store.acquire('b1', 'temperature')
      await flush()

      expect(makeRequest).toHaveBeenCalledTimes(1)
      // Must NOT omit credentials: the auth cookie has to ride along or the
      // now-authenticated sensor endpoints answer 401.
      expect(makeRequest).toHaveBeenCalledWith(
        '/sensor/temperature/entireBuilding?building=b1',
        'GET',
        expect.not.objectContaining({ credentials: 'omit' }),
      )
      expect(socketMock.emit).toHaveBeenCalledWith('subscribe_building', 'b1')
      expect(bucket.data.value).toHaveLength(1)
    })

    it('shares one bucket between two callers (single fetch + single subscribe)', async () => {
      const store = useSensorDataStore()

      const a = store.acquire('b1', 'temperature')
      const b = store.acquire('b1', 'temperature')
      await flush()

      expect(a).toBe(b)
      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(
        socketMock.emit.mock.calls.filter((c) => c[0] === 'subscribe_building').length,
      ).toBe(1)
    })

    it('joins the building room only once across different metric types', () => {
      const store = useSensorDataStore()

      store.acquire('b1', 'temperature')
      store.acquire('b1', 'airQuality')

      expect(
        socketMock.emit.mock.calls.filter((c) => c[0] === 'subscribe_building').length,
      ).toBe(1)
    })

    it('records the fetch error when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)
      const store = useSensorDataStore()

      const bucket = store.acquire('b1', 'temperature')
      await flush()

      expect(bucket.error.value).toBe('Fetch failed')
    })
  })

  describe('telemetry routing', () => {
    it('upserts a reading into the matching bucket by roomId', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { data: [{ roomId: 'r1', value: 21 }] }) as unknown as Response,
      )
      const store = useSensorDataStore()
      const bucket = store.acquire('b1', 'temperature')
      await flush()

      // Existing room → merged in place.
      fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 25 })
      expect(bucket.data.value[0]?.value).toBe(25)

      // New room → appended.
      fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r2', value: 30 })
      expect(bucket.data.value).toHaveLength(2)
    })

    it('routes by both type and building, ignoring non-matching events', async () => {
      const store = useSensorDataStore()
      const temp = store.acquire('b1', 'temperature')
      await flush()

      fireTelemetry({ type: 'airQuality', buildingId: 'b1', roomId: 'r1', value: 5 }) // wrong type
      fireTelemetry({ type: 'temperature', buildingId: 'b2', roomId: 'r1', value: 5 }) // wrong building
      expect(temp.data.value).toHaveLength(0)

      fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 5 })
      expect(temp.data.value).toHaveLength(1)
    })

    it('does not throw on telemetry for a building nobody acquired', () => {
      useSensorDataStore()
      expect(() =>
        fireTelemetry({ type: 'temperature', buildingId: 'ghost', roomId: 'r1', value: 1 }),
      ).not.toThrow()
    })
  })

  describe('release', () => {
    it('tears the bucket down and leaves the room on the last release', async () => {
      const store = useSensorDataStore()
      const bucket = store.acquire('b1', 'temperature')
      await flush()

      store.release('b1', 'temperature')

      expect(socketMock.emit).toHaveBeenCalledWith('unsubscribe_building', 'b1')
      // Bucket is gone: further telemetry no longer lands in the old reference.
      fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 9 })
      expect(bucket.data.value).toHaveLength(0)
    })

    it('keeps the bucket alive while another consumer still holds it', async () => {
      const store = useSensorDataStore()
      const bucket = store.acquire('b1', 'temperature')
      store.acquire('b1', 'temperature')
      await flush()

      store.release('b1', 'temperature')

      expect(socketMock.emit).not.toHaveBeenCalledWith('unsubscribe_building', 'b1')
      fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 9 })
      expect(bucket.data.value).toHaveLength(1)
    })

    it('keeps the building subscribed until its last metric is released', () => {
      const store = useSensorDataStore()
      store.acquire('b1', 'temperature')
      store.acquire('b1', 'airQuality')

      store.release('b1', 'temperature')
      expect(socketMock.emit).not.toHaveBeenCalledWith('unsubscribe_building', 'b1')

      store.release('b1', 'airQuality')
      expect(socketMock.emit).toHaveBeenCalledWith('unsubscribe_building', 'b1')
    })
  })

  describe('reconnect', () => {
    it('re-subscribes active buildings and refetches on socket connect', async () => {
      const store = useSensorDataStore()
      store.acquire('b1', 'temperature')
      await flush()

      vi.mocked(makeRequest).mockClear()
      socketMock.emit.mockClear()

      fireConnect()
      await flush()

      expect(socketMock.emit).toHaveBeenCalledWith('subscribe_building', 'b1')
      expect(makeRequest).toHaveBeenCalledTimes(1)
    })
  })
})
