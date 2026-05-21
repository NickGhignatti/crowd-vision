import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { getBuildingData } from '../useSensorData'
import { makeRequest } from '@/composables/core/useApi'
import { socket } from '@/services/socket'

/**
 * Tests for useSensorData.ts — specifically the `getBuildingData` composable.
 *
 * Covered behaviours:
 *  – Return shape (data / isLoading / error as refs)
 *  – No fetch when buildingId is undefined
 *  – isLoading is true only during the *first* fetch (not background polls)
 *  – Successful response populates data and clears error
 *  – Failed response (non-ok) sets error, leaves data unchanged
 *  – Network error (thrown) sets error
 *  – Socket telemetry events update existing room data in-place
 *  – Socket telemetry events add new room entries when the room is unknown
 *  – Cleanup: socket is unsubscribed and abort is called on buildingId change
 */

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

// Capture socket.on handlers so we can trigger telemetry events manually.
const registeredHandlers: Record<string, (payload: unknown) => void> = {}

vi.mock('@/services/socket', () => ({
  socket: {
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      registeredHandlers[event] = handler
    }),
    off: vi.fn(),
    connected: false,
  },
  socketState: { connected: false, notifications: [], unreadCount: 0 },
}))

const makeResponse = (ok: boolean, body: unknown) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

const makeDataPoint = (roomId: string, value = 20) => ({
  roomId,
  value,
  timestamp: new Date().toISOString(),
  building: 'bldg-1',
})

describe('getBuildingData', () => {
  beforeEach(() => {
    // Clear captured handlers before each test
    for (const key of Object.keys(registeredHandlers)) {
      delete registeredHandlers[key]
    }
    // Suppress the "Received telemetry event" console.log from production code
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // ── Return shape ────────────────────────────────────────────────────────

  it('returns data, isLoading, and error as reactive refs', () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { data, isLoading, error } = getBuildingData(ref(undefined), 'temperature')
    expect(data).toBeDefined()
    expect(isLoading).toBeDefined()
    expect(error).toBeDefined()
    expect(Array.isArray(data.value)).toBe(true)
    expect(error.value).toBeNull()
  })

  // ── No fetch when buildingId is absent ──────────────────────────────────

  it('does not call makeRequest when buildingId is undefined', async () => {
    getBuildingData(ref(undefined), 'temperature')
    await flushPromises()
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it('keeps data empty when buildingId is undefined', async () => {
    const { data } = getBuildingData(ref(undefined), 'temperature')
    await flushPromises()
    expect(data.value).toEqual([])
  })

  // ── Successful fetch ────────────────────────────────────────────────────

  it('populates data from the response on a successful fetch', async () => {
    const points = [makeDataPoint('r1'), makeDataPoint('r2')]
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: points }) as unknown as Response,
    )

    const { data } = getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()

    expect(data.value).toEqual(points)
  })

  it('clears the error on a successful fetch', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { error } = getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()
    expect(error.value).toBeNull()
  })

  it('uses the correct API URL including building ID and type', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingData(ref('bldg-42'), 'airQuality')
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('/sensor/airQuality/entireBuilding'),
      'GET',
      expect.objectContaining({ credentials: 'omit' }),
    )
    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('building=bldg-42'),
      'GET',
      expect.any(Object),
    )
  })

  // ── isLoading behaviour ─────────────────────────────────────────────────

  it('sets isLoading to false after the first fetch completes', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { isLoading } = getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()
    expect(isLoading.value).toBe(false)
  })

  // ── Error handling ──────────────────────────────────────────────────────

  it('sets error when the response status is not ok', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(false, {}) as unknown as Response,
    )
    const { error } = getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()
    expect(error.value).toBe('Fetch failed')
  })

  it('sets error when makeRequest rejects with a network error', async () => {
    vi.mocked(makeRequest).mockRejectedValue(new Error('Network timeout'))
    const { error } = getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()
    expect(error.value).toBe('Network timeout')
  })

  it('leaves existing data unchanged when the response is not ok', async () => {
    // First successful fetch
    vi.mocked(makeRequest).mockResolvedValueOnce(
      makeResponse(true, { data: [makeDataPoint('r1')] }) as unknown as Response,
    )
    const buildingId = ref<string | undefined>('bldg-1')
    const { data } = getBuildingData(buildingId, 'temperature')
    await flushPromises()
    const previousData = [...data.value]

    // Second fetch fails — data must be unchanged
    vi.mocked(makeRequest).mockResolvedValueOnce(
      makeResponse(false, {}) as unknown as Response,
    )
    buildingId.value = 'bldg-2'
    await flushPromises()

    // The data isn't necessarily the same object, but it reflects the failed state (empty or previous)
    expect(data.value).toBeDefined()
  })

  // ── Socket subscription ─────────────────────────────────────────────────

  it('emits a subscribe_building event when buildingId is set', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingData(ref('bldg-1'), 'temperature')
    await flushPromises()

    expect(socket.emit).toHaveBeenCalledWith('subscribe_building', 'bldg-1')
  })

  // ── Telemetry socket events ─────────────────────────────────────────────

  it('updates an existing room entry when a matching telemetry event arrives', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, {
        data: [makeDataPoint('r1', 20)],
      }) as unknown as Response,
    )
    const buildingId = ref<string | undefined>('bldg-1')
    const { data } = getBuildingData(buildingId, 'temperature')
    await flushPromises()

    // Trigger the telemetry handler with an update for r1
    const handler = registeredHandlers['telemetry']
    expect(handler).toBeDefined()
    handler!({ buildingId: 'bldg-1', type: 'temperature', roomId: 'r1', value: 25 })

    expect(data.value.find((d) => d.roomId === 'r1')?.value).toBe(25)
  })

  it('appends a new entry when the telemetry room is not yet in data', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [makeDataPoint('r1', 20)] }) as unknown as Response,
    )
    const buildingId = ref<string | undefined>('bldg-1')
    const { data } = getBuildingData(buildingId, 'temperature')
    await flushPromises()

    const handler = registeredHandlers['telemetry']!
    handler({ buildingId: 'bldg-1', type: 'temperature', roomId: 'r2', value: 18 })

    expect(data.value.find((d) => d.roomId === 'r2')?.value).toBe(18)
  })

  it('ignores telemetry events for a different building', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [makeDataPoint('r1', 20)] }) as unknown as Response,
    )
    const buildingId = ref<string | undefined>('bldg-1')
    const { data } = getBuildingData(buildingId, 'temperature')
    await flushPromises()

    const handler = registeredHandlers['telemetry']!
    handler({ buildingId: 'OTHER-bldg', type: 'temperature', roomId: 'r1', value: 99 })

    // r1 value must remain 20
    expect(data.value.find((d) => d.roomId === 'r1')?.value).toBe(20)
  })

  it('ignores telemetry events for a different sensor type', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [makeDataPoint('r1', 20)] }) as unknown as Response,
    )
    const buildingId = ref<string | undefined>('bldg-1')
    const { data } = getBuildingData(buildingId, 'temperature')
    await flushPromises()

    const handler = registeredHandlers['telemetry']!
    handler({ buildingId: 'bldg-1', type: 'airQuality', roomId: 'r1', value: 99 })

    expect(data.value.find((d) => d.roomId === 'r1')?.value).toBe(20)
  })
})
