const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://test-api.com'

export function authenticatedFetch(url: string, method: string = "GET", options: object = {}) {
  return fetch(API_BASE_URL + url, {
    method: method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })
}

export function nonAuthenticatedFetch(url: string, method: string = 'GET', options: object = {}) {
  return fetch(API_BASE_URL + url, {
    method: method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })
}
