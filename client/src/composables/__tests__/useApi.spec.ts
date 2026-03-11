import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authenticatedFetch, nonAuthenticatedFetch } from '../useApi.ts'

const BASE_URL = 'http://test-api.com'

describe('useApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()))
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('authenticatedFetch', () => {
    it('calls fetch with the correct full URL', () => {
      authenticatedFetch('/users')

      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/users`, expect.any(Object))
    })

    it('uses GET as default method', () => {
      authenticatedFetch('/users')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
        }),
      )
    })

    it('uses the provided method', () => {
      authenticatedFetch('/users', 'POST')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })

    it('sets Content-Type to application/json', () => {
      authenticatedFetch('/users')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('sets Authorization header with token from localStorage', () => {
      localStorage.setItem('token', 'my-token')

      authenticatedFetch('/users')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        }),
      )
    })

    it('sets Authorization header with null when no token in localStorage', () => {
      authenticatedFetch('/users')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer null',
          }),
        }),
      )
    })

    it('merges extra options into the request', () => {
      authenticatedFetch('/users', 'POST', { body: JSON.stringify({ name: 'John' }) })

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ name: 'John' }),
        }),
      )
    })

    it('returns the fetch promise', () => {
      const mockResponse = new Response()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const result = authenticatedFetch('/users')

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
        expect.objectContaining({
          method: 'GET',
        }),
      )
    })

    it('uses the provided method', () => {
      nonAuthenticatedFetch('/login', 'POST')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })

    it('sets Content-Type to application/json', () => {
      nonAuthenticatedFetch('/login')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('does not set Authorization header', () => {
      localStorage.setItem('token', 'my-token')

      nonAuthenticatedFetch('/login')

      const calledWith = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
      expect(calledWith.headers).not.toHaveProperty('Authorization')
    })

    it('merges extra options into the request', () => {
      nonAuthenticatedFetch('/login', 'POST', { body: JSON.stringify({ email: 'a@b.com' }) })

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ email: 'a@b.com' }),
        }),
      )
    })

    it('returns the fetch promise', () => {
      const result = nonAuthenticatedFetch('/login')

      expect(result).toBeInstanceOf(Promise)
    })
  })
})
