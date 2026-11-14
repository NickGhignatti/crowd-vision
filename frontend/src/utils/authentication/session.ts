const MINUTE_MS = 60 * 1000

/** The gateway pass lives 15 min, so it is renewed with a margin while it is still valid. */
export const REFRESH_INTERVAL_MS = 10 * MINUTE_MS

/** A renewal that never reached the gateway is worth retrying long before the pass dies. */
export const REFRESH_RETRY_MS = 30 * 1000

// A 401 here means a refused credential or a logout already in progress, not a dead session.
const CREDENTIAL_PATHS = [
  '/gateway/login',
  '/gateway/register',
  '/gateway/exchange',
  '/gateway/logout',
  '/gateway/profile/password',
]

/** Whether a 401 means the session is over, rather than one credential being refused. */
export function shouldEndSession(path: string, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return false

  return !CREDENTIAL_PATHS.some((exempt) => path.startsWith(exempt))
}

/** How long to wait before the next renewal: the full interval only after a successful one. */
export function nextRefreshDelayMs(renewed: boolean): number {
  return renewed ? REFRESH_INTERVAL_MS : REFRESH_RETRY_MS
}
