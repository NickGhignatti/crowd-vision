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

/** Runs `fn` over `items` with at most `limit` in flight at once, e.g. to submit many
 * per-room requests without bursting enough simultaneous connections to trip a proxy. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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

