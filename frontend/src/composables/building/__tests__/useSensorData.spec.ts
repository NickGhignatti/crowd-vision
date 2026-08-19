import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { getBuildingData } from '@/composables/building/useSensorData.ts'
import { makeRequest } from '@/composables/core/useApi.ts'

const { socketMock, socketHandlers } = vi.hoisted(() => {
  const socketHandlers: Record<string, (...args: unknown[]) => void> = {}
  const socketMock = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      socketHandlers[event] = cb
    }),
    off: vi.fn((event: string) => {
      delete socketHandlers[event]
    }),
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

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('getBuildingData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(socketHandlers)) delete socketHandlers[k]
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('subscribes to the building room on start', () => {
    getBuildingData(ref('b1'), 'temperature')

    expect(socketMock.emit).toHaveBeenCalledWith('subscribe_building', 'b1')
  })

  describe('after a reconnect', () => {
    it('re-subscribes, because the server forgot the room across the handshake', async () => {
      getBuildingData(ref('b1'), 'temperature')
      await flush()
      socketMock.emit.mockClear()

      socketHandlers['connect']?.()

      expect(socketMock.emit).toHaveBeenCalledWith('subscribe_building', 'b1')
    })

    it('refetches so the gap left by the disconnect is filled', async () => {
      getBuildingData(ref('b1'), 'temperature')
      await flush()
      vi.mocked(makeRequest).mockClear()

      socketHandlers['connect']?.()
      await flush()

      expect(makeRequest).toHaveBeenCalledWith(
        '/telemetry/temperature/entireBuilding?building=b1',
        'GET',
        expect.anything(),
      )
    })

    it('does not flip the view back into its loading state', async () => {
      const { isLoading } = getBuildingData(ref('b1'), 'temperature')
      await flush()

      socketHandlers['connect']?.()

      expect(isLoading.value).toBe(false)
    })

    it('stops re-subscribing once the building changes', async () => {
      const buildingId = ref<string | undefined>('b1')
      getBuildingData(buildingId, 'temperature')
      await flush()

      buildingId.value = 'b2'
      await flush()
      socketMock.emit.mockClear()

      socketHandlers['connect']?.()

      expect(socketMock.emit).toHaveBeenCalledWith('subscribe_building', 'b2')
      expect(socketMock.emit).not.toHaveBeenCalledWith('subscribe_building', 'b1')
    })
  })
})
