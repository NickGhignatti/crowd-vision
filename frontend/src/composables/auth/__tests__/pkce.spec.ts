import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/composables/auth/pkce.ts'

describe('generateCodeVerifier', () => {
  it('produces a base64url string with no padding or unsafe characters', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces a different value on each call', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).not.toBe(b)
  })
})

describe('generateCodeChallenge', () => {
  it('is deterministic for the same verifier (SHA-256 is a pure function)', async () => {
    const verifier = 'a-fixed-test-verifier-value'
    const a = await generateCodeChallenge(verifier)
    const b = await generateCodeChallenge(verifier)
    expect(a).toBe(b)
  })

  it('matches the known RFC 7636 appendix B test vector', async () => {
    // https://www.rfc-editor.org/rfc/rfc7636#appendix-B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await generateCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces a base64url string with no padding', async () => {
    const challenge = await generateCodeChallenge('any-verifier')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('generateState', () => {
  it('produces a different value on each call', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
  })
})
