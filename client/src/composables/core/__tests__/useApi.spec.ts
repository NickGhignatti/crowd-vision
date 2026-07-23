import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  makeExternalRequest,
  makeRequest,
  makeRequestWithRetry,
  mapWithConcurrency,
} from '@/composables/core/useApi.ts'

const fetchSpy = vi.spyOn(global, 'fetch')

describe('useApi.ts - makeRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Provide a default successful response for fetch
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  describe('default behavior', () => {
    it('calls fetch with the correct base URL and endpoint', async () => {
      await makeRequest('/health')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith('http://test-api.com/health', expect.any(Object))
    })

    it('uses GET as the default method and includes default configuration', async () => {
      await makeRequest('/data')

      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('custom parameters', () => {
    it('uses the provided HTTP method', async () => {
      await makeRequest('/users', 'POST')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('merges custom options into the fetch configuration', async () => {
      const customOptions = {
        body: JSON.stringify({ name: 'Alice' }),
      }

      await makeRequest('/users', 'POST', customOptions)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: '{"name":"Alice"}',
        }),
      )
    })

    it('allows overriding default headers via custom options', async () => {
      const customOptions = {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: 'Bearer test-token',
        },
      }

      await makeRequest('/upload', 'PUT', customOptions)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: 'Bearer test-token',
          },
        }),
      )
    })

    it('supports absolute URLs without prefixing the API base URL', async () => {
      await makeRequest('http://simulator.local/control/status/?buildingId=abc')

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://simulator.local/control/status/?buildingId=abc',
        expect.any(Object),
      )
    })

    it('allows overriding default credentials in custom options', async () => {
      await makeRequest('/simulator/status', 'GET', {
        credentials: 'omit',
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://test-api.com/simulator/status',
        expect.objectContaining({
          credentials: 'omit',
        }),
      )
    })

    it('sends external URLs without prefixing the API base URL', async () => {
      await makeExternalRequest('http://localhost:3001/control/status/?buildingId=abc')

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3001/control/status/?buildingId=abc',
        expect.objectContaining({
          credentials: 'omit',
        }),
      )
    })
  })
})

describe('useApi.ts - makeRequestWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the response on the first successful attempt without retrying', async () => {
    fetchSpy.mockResolvedValue({ ok: true } as Response)

    const result = await makeRequestWithRetry('/rooms/1', 'PATCH')

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries after a transient network failure and succeeds', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response)

    const promise = makeRequestWithRetry('/rooms/1', 'PATCH', {}, 2)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('rethrows once retries are exhausted', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    const promise = makeRequestWithRetry('/rooms/1', 'PATCH', {}, 2)
    // Awaited below (`await expectation`) after advancing fake timers so the backoff
    // retries can resolve; awaiting it inline here would deadlock on the pending timers.
    // eslint-disable-next-line vitest/valid-expect
    const expectation = expect(promise).rejects.toThrow('Failed to fetch')
    await vi.runAllTimersAsync()
    await expectation

    expect(fetchSpy).toHaveBeenCalledTimes(3) // initial attempt + 2 retries
  })
})

describe('useApi.ts - mapWithConcurrency', () => {
  it('resolves every item and preserves input order regardless of completion order', async () => {
    const items = [30, 10, 20]
    const result = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })

    expect(result).toEqual([30, 10, 20])
  })

  it('never runs more than `limit` callbacks at once', async () => {
    let active = 0
    let maxActive = 0

    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active--
    })

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('propagates a callback rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })
})
