import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authenticatedFetch, nonAuthenticatedFetch } from '../useApi.ts'

const BASE_URL = 'http://test-api.com'

describe('useApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('authenticatedFetch', () => {
    it('calls fetch with the correct full URL', () => {
      authenticatedFetch('/accounts')

      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/accounts`, expect.any(Object))
    })

    it('uses GET as default method', () => {
      authenticatedFetch('/accounts')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('uses the provided method', () => {
      authenticatedFetch('/accounts', 'POST')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sets Content-Type to application/json', () => {
      authenticatedFetch('/accounts')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      )
    })

    it('includes credentials for cookie attachment', () => {
      authenticatedFetch('/accounts')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' }),
      )
    })

    it('does not set an Authorization header', () => {
      authenticatedFetch('/accounts')

      const calledWith = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
      expect(calledWith.headers).not.toHaveProperty('Authorization')
    })

    it('merges extra options into the request', () => {
      authenticatedFetch('/accounts', 'POST', { body: JSON.stringify({ name: 'John' }) })

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ name: 'John' }) }),
      )
    })

    it('returns the fetch promise', () => {
      const result = authenticatedFetch('/accounts')

      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('nonAuthenticatedFetch', () => {
    it('calls fetch with the correct full URL', () => {
      nonAuthenticatedFetch('/login')

      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/login`, expect.any(Object))
    })

    it('uses GET as default method', () => {
      nonAuthenticatedFetch('/login')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('uses the provided method', () => {
      nonAuthenticatedFetch('/login', 'POST')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sets Content-Type to application/json', () => {
      nonAuthenticatedFetch('/login')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      )
    })

    it('includes credentials so the server can set the auth cookie on login', () => {
      nonAuthenticatedFetch('/login')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' }),
      )
    })

    it('does not set an Authorization header', () => {
      nonAuthenticatedFetch('/login')

      const calledWith = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
      expect(calledWith.headers).not.toHaveProperty('Authorization')
    })

    it('merges extra options into the request', () => {
      nonAuthenticatedFetch('/login', 'POST', { body: JSON.stringify({ email: 'a@b.com' }) })

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ email: 'a@b.com' }) }),
      )
    })

    it('returns the fetch promise', () => {
      const result = nonAuthenticatedFetch('/login')

      expect(result).toBeInstanceOf(Promise)
    })
  })
})
