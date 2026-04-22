const isTestEnv = import.meta.env.MODE === 'test'

const API_BASE_URL = import.meta.env.VITE_SERVER_URL || (isTestEnv ? 'http://test-api.com' : '')

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

function resolveRequestUrl(url: string): string {
  if (ABSOLUTE_URL_REGEX.test(url)) {
    return url
  }

  return API_BASE_URL + url
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers
}

export function makeRequest(url: string, method: string = 'GET', options: RequestInit = {}) {
  const { headers, ...requestOptions } = options

  return fetch(resolveRequestUrl(url), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    ...requestOptions,
  })
}

export function makeExternalRequest(url: string, method: string = 'GET', options: RequestInit = {}) {
  const { headers, ...requestOptions } = options

  return fetch(url, {
    method,
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    ...requestOptions,
  })
}

