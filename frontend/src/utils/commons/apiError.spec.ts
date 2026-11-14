import { describe, expect, it } from 'vitest'
import { errorMessageFrom } from './apiError.ts'

describe('reading a failed response body', () => {
  it('keeps the plain text the edge writes, trimmed', () => {
    expect(errorMessageFrom(401, 'invalid token\n')).toBe('invalid token')
  })

  it('takes the message a service writes in JSON', () => {
    expect(errorMessageFrom(403, '{"type":"Forbidden","message":"not a member"}')).toBe(
      'not a member',
    )
  })

  it('falls back to the status when there is no body', () => {
    expect(errorMessageFrom(401, '')).toBe('Request failed (401)')
    expect(errorMessageFrom(500, '  \n')).toBe('Request failed (500)')
  })

  it('shows a JSON body it cannot read instead of swallowing it', () => {
    expect(errorMessageFrom(400, '{"unexpected":true}')).toBe('{"unexpected":true}')
  })
})
