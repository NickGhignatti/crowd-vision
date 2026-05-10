import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeExternalRequest, makeRequest } from '@/composables/core/useApi.ts'

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
