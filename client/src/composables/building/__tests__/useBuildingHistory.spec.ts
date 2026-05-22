import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { getBuildingHistory } from '../useBuildingHistory'
import { makeRequest } from '@/composables/core/useApi'

/**
 * Tests for useBuildingHistory.ts.
 *
 * The composable wraps a `watchEffect`-driven API call and returns
 * `{ data, isLoading, error }`. Since server-side aggregation was introduced,
 * the sensor-service dashboard endpoint returns `{ timestamp: number, value: number }[]`
 * directly — no client-side field-key extraction is needed.
 *
 * Covered behaviours:
 *  – Return shape (data / isLoading / error as refs)
 *  – URL construction: apiType, buildingId, timeRange, aggMode all included
 *  – Data mapping: server `{ timestamp, value }` passthrough
 *  – value defaults to 0 when the field is absent
 *  – Empty response → empty data array
 *  – Loading flag is false after fetch completes
 *  – Error handling: non-ok response, network error
 *  – Reactivity: re-fetches when buildingId, range, or aggMode change
 *  – No fetch when buildingId is undefined
 */

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeResponse = (ok: boolean, body: unknown) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

/** Build a pre-aggregated data point as the server now returns. */
const makePoint = (timestamp: number, value: number) => ({ timestamp, value })

describe('getBuildingHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Return shape ─────────────────────────────────────────────────────────

  it('returns data, isLoading, and error refs', () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { data, isLoading, error } = getBuildingHistory(
      ref('bldg-1'), ref('1D'), 'temperature', ref('avg'),
    )
    expect(data).toBeDefined()
    expect(isLoading).toBeDefined()
    expect(error).toBeDefined()
  })

  it('data starts as an empty array before the first fetch resolves', () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    expect(Array.isArray(data.value)).toBe(true)
  })

  // ── URL construction ──────────────────────────────────────────────────────

  it('calls the API with the correct sensor-type path segment', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('/sensor/temperature/dashboard'),
      'GET',
      expect.any(Object),
    )
  })

  it('includes buildingId in the URL query string', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-42'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('building=bldg-42'),
      'GET',
      expect.any(Object),
    )
  })

  it('includes the time range in the URL query string', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-1'), ref('1W'), 'temperature', ref('avg'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('timeRange=1W'),
      'GET',
      expect.any(Object),
    )
  })

  it('includes the aggMode in the URL query string', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('sum'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('aggMode=sum'),
      'GET',
      expect.any(Object),
    )
  })

  it('uses the peopleCount sensor path for peopleCount type', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-1'), ref('1D'), 'peopleCount', ref('avg'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('/sensor/peopleCount/dashboard'),
      'GET',
      expect.any(Object),
    )
  })

  it('uses the airQuality sensor path for airQuality type', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    getBuildingHistory(ref('bldg-1'), ref('1D'), 'airQuality', ref('avg'))
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('/sensor/airQuality/dashboard'),
      'GET',
      expect.any(Object),
    )
  })

  // ── Data mapping ──────────────────────────────────────────────────────────

  it('maps the server response { timestamp, value } shape directly', async () => {
    const point = makePoint(1_700_000_000_000, 22.5)
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [point] }) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(data.value[0]).toEqual({ timestamp: 1_700_000_000_000, value: 22.5 })
  })

  it('maps multiple data points preserving order', async () => {
    const points = [makePoint(1_000, 10), makePoint(2_000, 20), makePoint(3_000, 30)]
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: points }) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(data.value).toEqual(points)
  })

  it('defaults the value to 0 when the value field is absent', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, {
        data: [{ timestamp: 1_700_000_000_000 }], // value field missing
      }) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(data.value[0]?.value).toBe(0)
  })

  it('returns an empty array when the response data is empty', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(data.value).toEqual([])
  })

  it('handles a missing data key in the response gracefully', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, {}) as unknown as Response,
    )
    const { data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(data.value).toEqual([])
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  it('sets isLoading to false after the fetch completes successfully', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const { isLoading } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(isLoading.value).toBe(false)
  })

  // ── Error handling ────────────────────────────────────────────────────────

  it('sets error when the response status is not ok', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(false, {}) as unknown as Response,
    )
    const { error, data } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(error.value).toBe('Fetch failed')
    expect(data.value).toEqual([])
  })

  it('sets error when makeRequest throws a network error', async () => {
    vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))
    const { error } = getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(error.value).toBe('Network error')
  })

  it('clears error on a subsequent successful fetch', async () => {
    vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Gone'))
    const range = ref('1D')
    const { error } = getBuildingHistory(ref('bldg-1'), range, 'temperature', ref('avg'))
    await flushPromises()
    expect(error.value).toBe('Gone')

    vi.mocked(makeRequest).mockResolvedValueOnce(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    range.value = '1W'
    await flushPromises()

    expect(error.value).toBeNull()
  })

  // ── Reactivity ────────────────────────────────────────────────────────────

  it('re-fetches when the time range changes', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const range = ref('1D')
    getBuildingHistory(ref('bldg-1'), range, 'temperature', ref('avg'))
    await flushPromises()

    range.value = '1W'
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledTimes(2)
  })

  it('re-fetches when the aggMode changes', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const aggMode = ref('avg')
    getBuildingHistory(ref('bldg-1'), ref('1D'), 'temperature', aggMode)
    await flushPromises()

    aggMode.value = 'max'
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledTimes(2)
    expect(makeRequest).toHaveBeenLastCalledWith(
      expect.stringContaining('aggMode=max'),
      'GET',
      expect.any(Object),
    )
  })

  it('re-fetches when the buildingId changes', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
    const buildingId = ref('bldg-1')
    getBuildingHistory(buildingId, ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    buildingId.value = 'bldg-2'
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledTimes(2)
    expect(makeRequest).toHaveBeenLastCalledWith(
      expect.stringContaining('building=bldg-2'),
      'GET',
      expect.any(Object),
    )
  })

  it('does not fetch when buildingId is falsy', async () => {
    const buildingId = ref<string | undefined>(undefined)
    getBuildingHistory(buildingId, ref('1D'), 'temperature', ref('avg'))
    await flushPromises()

    expect(makeRequest).not.toHaveBeenCalled()
  })
})
