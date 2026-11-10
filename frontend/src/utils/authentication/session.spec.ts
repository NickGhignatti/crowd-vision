import { describe, expect, it } from 'vitest'
import {
  nextRefreshDelayMs,
  REFRESH_INTERVAL_MS,
  REFRESH_RETRY_MS,
  shouldEndSession,
} from './session.ts'

describe('when a 401 ends the session', () => {
  it('ends it when a signed-in caller is refused', () => {
    expect(shouldEndSession('/twin/buildings/eng', true)).toBe(true)
  })

  it('ignores a 401 while nobody is signed in', () => {
    expect(shouldEndSession('/twin/buildings/eng', false)).toBe(false)
  })

  it('keeps the session when the refused credential is the password being changed', () => {
    expect(shouldEndSession('/gateway/profile/password', true)).toBe(false)
  })

  it('keeps it on the calls that run before or after a session', () => {
    expect(shouldEndSession('/gateway/login', true)).toBe(false)
    expect(shouldEndSession('/gateway/register', true)).toBe(false)
    expect(shouldEndSession('/gateway/exchange', true)).toBe(false)
    expect(shouldEndSession('/gateway/logout', true)).toBe(false)
  })

  it('ends it when the renewal itself is refused', () => {
    expect(shouldEndSession('/gateway/refresh', true)).toBe(true)
  })
})

describe('how long until the next renewal', () => {
  it('waits the full interval after a renewal', () => {
    expect(nextRefreshDelayMs(true)).toBe(REFRESH_INTERVAL_MS)
  })

  it('retries soon when the gateway could not be reached', () => {
    expect(nextRefreshDelayMs(false)).toBe(REFRESH_RETRY_MS)
  })

  it('never waits as long as the pass lives', () => {
    expect(REFRESH_RETRY_MS).toBeLessThan(REFRESH_INTERVAL_MS)
    expect(REFRESH_INTERVAL_MS).toBeLessThan(15 * 60 * 1000)
  })
})
