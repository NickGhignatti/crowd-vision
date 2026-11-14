import { errorMessageFrom } from '@/utils/commons/apiError.ts'

const isTestEnv = import.meta.env.MODE === 'test'

const API_BASE_URL = import.meta.env.VITE_SERVER_URL || (isTestEnv ? 'http://test-api.com' : '')

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

const HTTP_UNAUTHORIZED = 401

type UnauthorizedHandler = (path: string) => void

let unauthorizedHandler: UnauthorizedHandler | null = null

/** Registered once, in the composition root: callers stay unaware of sessions. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

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

export async function makeRequest(
  url: string,
  method: string = 'GET',
  options: RequestInit = {},
): Promise<Response> {
  const { headers, ...requestOptions } = options

  const response = await fetch(resolveRequestUrl(url), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    ...requestOptions,
  })

  if (response.status === HTTP_UNAUTHORIZED) unauthorizedHandler?.(url)

  return response
}

/** A failed body comes as plain text from the edge and as JSON from the services. */
export async function readErrorMessage(response: Response): Promise<string> {
  return errorMessageFrom(response.status, await response.text())
}

/**
 * Retries a request when `fetch` itself rejects (e.g. a reset connection), not on
 * HTTP error statuses — those are valid responses the caller decides how to handle.
 */
export async function makeRequestWithRetry(
  url: string,
  method: string = 'GET',
  options: RequestInit = {},
  retries: number = 2,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await makeRequest(url, method, options)
    } catch (err) {
      if (attempt >= retries) throw err
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

export function makeExternalRequest(
  url: string,
  method: string = 'GET',
  options: RequestInit = {},
) {
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
