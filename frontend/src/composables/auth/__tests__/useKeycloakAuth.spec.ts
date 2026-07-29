import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'
import { makeExternalRequest, makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'

vi.mock('@/composables/auth/pkce.ts', () => ({
  generateCodeVerifier: vi.fn(() => 'test-verifier'),
  generateCodeChallenge: vi.fn(async () => 'test-challenge'),
  generateState: vi.fn(() => 'test-state'),
}))

vi.mock('@/composables/core/useApi.ts', () => ({
  makeExternalRequest: vi.fn(),
  makeRequest: vi.fn(),
}))

vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: vi.fn(),
}))

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('useKeycloakAuth', () => {
  let originalLocation: Location

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorage.clear()

    originalLocation = window.location
    // @ts-expect-error -- replacing window.location for the redirect assertion
    delete window.location
    // @ts-expect-error -- minimal Location stand-in
    window.location = { origin: 'http://localhost:5173', href: '' }
  })

  afterEach(() => {
    // @ts-expect-error -- restoring the real Location after the test's minimal stand-in
    window.location = originalLocation
  })

  describe('beginLogin', () => {
    it('redirects to the Keycloak authorization endpoint with PKCE params', async () => {
      const { beginLogin } = useKeycloakAuth()
      await beginLogin('/dashboards')

      expect(window.location.href).toContain('/realms/crowdvision/protocol/openid-connect/auth')
      expect(window.location.href).toContain('client_id=cv-web')
      expect(window.location.href).toContain('code_challenge=test-challenge')
      expect(window.location.href).toContain('code_challenge_method=S256')
      expect(window.location.href).toContain('state=test-state')
      expect(window.location.href).toContain(
        encodeURIComponent('http://localhost:5173/auth/callback'),
      )
    })

    it('stashes the verifier, state, and redirect path for the callback to consume', async () => {
      const { beginLogin } = useKeycloakAuth()
      await beginLogin('/dashboards')

      expect(sessionStorage.getItem('cv.pkce.verifier')).toBe('test-verifier')
      expect(sessionStorage.getItem('cv.pkce.state')).toBe('test-state')
      expect(sessionStorage.getItem('cv.pkce.redirect')).toBe('/dashboards')
    })

    it('omits kc_idp_hint when no identity provider is requested', async () => {
      const { beginLogin } = useKeycloakAuth()
      await beginLogin('/')

      expect(window.location.href).not.toContain('kc_idp_hint')
    })

    it('adds kc_idp_hint to route straight to a brokered provider (e.g. google)', async () => {
      const { beginLogin } = useKeycloakAuth()
      await beginLogin('/dashboards', 'google')

      expect(window.location.href).toContain('kc_idp_hint=google')
      expect(window.location.href).toContain('/protocol/openid-connect/auth')
    })
  })

  describe('beginRegister', () => {
    it('redirects to the Keycloak registration endpoint', async () => {
      const { beginRegister } = useKeycloakAuth()
      await beginRegister('/')

      expect(window.location.href).toContain(
        '/realms/crowdvision/protocol/openid-connect/registrations',
      )
    })

    it('adds kc_idp_hint on registration when a provider is requested', async () => {
      const { beginRegister } = useKeycloakAuth()
      await beginRegister('/', 'google')

      expect(window.location.href).toContain('kc_idp_hint=google')
    })
  })

  describe('completeLogin', () => {
    it('rejects a state that does not match what was stashed', async () => {
      sessionStorage.setItem('cv.pkce.verifier', 'test-verifier')
      sessionStorage.setItem('cv.pkce.state', 'expected-state')
      sessionStorage.setItem('cv.pkce.redirect', '/dashboards')

      const { completeLogin } = useKeycloakAuth()
      const result = await completeLogin('auth-code', 'tampered-state')

      expect(result).toEqual({ ok: false, redirectPath: '/dashboards' })
      expect(makeExternalRequest).not.toHaveBeenCalled()
    })

    it('rejects when there is no verifier stashed (e.g. a stale/replayed callback)', async () => {
      sessionStorage.setItem('cv.pkce.state', 'test-state')

      const { completeLogin } = useKeycloakAuth()
      const result = await completeLogin('auth-code', 'test-state')

      expect(result.ok).toBe(false)
    })

    it('clears the stashed PKCE values after use (single-use)', async () => {
      sessionStorage.setItem('cv.pkce.verifier', 'test-verifier')
      sessionStorage.setItem('cv.pkce.state', 'test-state')
      sessionStorage.setItem('cv.pkce.redirect', '/dashboards')
      vi.mocked(makeExternalRequest).mockResolvedValue(
        makeResponse(true, { id_token: 'the-id-token' }) as unknown as Response,
      )
      vi.mocked(useAuthStore).mockReturnValue({
        completeLogin: vi.fn().mockResolvedValue(true),
      } as unknown as ReturnType<typeof useAuthStore>)

      const { completeLogin } = useKeycloakAuth()
      await completeLogin('auth-code', 'test-state')

      expect(sessionStorage.getItem('cv.pkce.verifier')).toBeNull()
      expect(sessionStorage.getItem('cv.pkce.state')).toBeNull()
      expect(sessionStorage.getItem('cv.pkce.redirect')).toBeNull()
    })

    it('exchanges the code at Keycloak token endpoint with the stashed verifier', async () => {
      sessionStorage.setItem('cv.pkce.verifier', 'test-verifier')
      sessionStorage.setItem('cv.pkce.state', 'test-state')
      sessionStorage.setItem('cv.pkce.redirect', '/dashboards')
      vi.mocked(makeExternalRequest).mockResolvedValue(
        makeResponse(true, { id_token: 'the-id-token' }) as unknown as Response,
      )
      const mockCompleteLogin = vi.fn().mockResolvedValue(true)
      vi.mocked(useAuthStore).mockReturnValue({
        completeLogin: mockCompleteLogin,
      } as unknown as ReturnType<typeof useAuthStore>)

      const { completeLogin } = useKeycloakAuth()
      await completeLogin('auth-code', 'test-state')

      expect(makeExternalRequest).toHaveBeenCalledWith(
        expect.stringContaining('/realms/crowdvision/protocol/openid-connect/token'),
        'POST',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      )
      const call = vi.mocked(makeExternalRequest).mock.calls[0]
      const body = (call?.[2] as { body: string }).body
      expect(body).toContain('code=auth-code')
      expect(body).toContain('code_verifier=test-verifier')
      expect(body).toContain('grant_type=authorization_code')
    })

    it('forwards the id_token to the auth store and returns its result', async () => {
      sessionStorage.setItem('cv.pkce.verifier', 'test-verifier')
      sessionStorage.setItem('cv.pkce.state', 'test-state')
      sessionStorage.setItem('cv.pkce.redirect', '/dashboards')
      vi.mocked(makeExternalRequest).mockResolvedValue(
        makeResponse(true, { id_token: 'the-id-token' }) as unknown as Response,
      )
      const mockCompleteLogin = vi.fn().mockResolvedValue(true)
      vi.mocked(useAuthStore).mockReturnValue({
        completeLogin: mockCompleteLogin,
      } as unknown as ReturnType<typeof useAuthStore>)

      const { completeLogin } = useKeycloakAuth()
      const result = await completeLogin('auth-code', 'test-state')

      expect(mockCompleteLogin).toHaveBeenCalledWith('the-id-token')
      expect(result).toEqual({ ok: true, redirectPath: '/dashboards' })
    })

    it('fails gracefully when the token endpoint rejects the exchange', async () => {
      sessionStorage.setItem('cv.pkce.verifier', 'test-verifier')
      sessionStorage.setItem('cv.pkce.state', 'test-state')
      sessionStorage.setItem('cv.pkce.redirect', '/dashboards')
      vi.mocked(makeExternalRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const { completeLogin } = useKeycloakAuth()
      const result = await completeLogin('auth-code', 'test-state')

      expect(result.ok).toBe(false)
      expect(useAuthStore).not.toHaveBeenCalled()
    })
  })

  describe('loginWithPassword', () => {
    it('posts credentials to gateway/login and hydrates the store on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)
      const mockHydrate = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        hydrate: mockHydrate,
      } as unknown as ReturnType<typeof useAuthStore>)

      const { loginWithPassword } = useKeycloakAuth()
      const result = await loginWithPassword('mario', 'correct-password')

      expect(makeRequest).toHaveBeenCalledWith(
        '/gateway/login',
        'POST',
        expect.objectContaining({ body: JSON.stringify({ username: 'mario', password: 'correct-password' }) }),
      )
      expect(mockHydrate).toHaveBeenCalledWith(true)
      expect(result).toEqual({ ok: true })
    })

    it('reports invalid credentials on a 401 without hydrating the store', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        ok: false,
        status: 401,
      } as unknown as Response)

      const { loginWithPassword } = useKeycloakAuth()
      const result = await loginWithPassword('mario', 'wrong-password')

      expect(result).toEqual({ ok: false, error: 'invalidCredentials' })
      expect(useAuthStore).not.toHaveBeenCalled()
    })

    it('reports a generic error for any other failure status', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        ok: false,
        status: 503,
      } as unknown as Response)

      const { loginWithPassword } = useKeycloakAuth()
      const result = await loginWithPassword('mario', 'x')

      expect(result).toEqual({ ok: false, error: 'authErrorGeneric' })
    })
  })

  describe('registerWithPassword', () => {
    it('posts the new account to gateway/register and hydrates the store on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)
      const mockHydrate = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        hydrate: mockHydrate,
      } as unknown as ReturnType<typeof useAuthStore>)

      const { registerWithPassword } = useKeycloakAuth()
      const result = await registerWithPassword('new@unibo.it', 's3cret!', 'Mario Rossi')

      expect(makeRequest).toHaveBeenCalledWith(
        '/gateway/register',
        'POST',
        expect.objectContaining({
          body: JSON.stringify({ email: 'new@unibo.it', password: 's3cret!', name: 'Mario Rossi' }),
        }),
      )
      expect(mockHydrate).toHaveBeenCalledWith(true)
      expect(result).toEqual({ ok: true })
    })

    it('registers without a name (display name is optional)', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        hydrate: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof useAuthStore>)

      const { registerWithPassword } = useKeycloakAuth()
      await registerWithPassword('new@unibo.it', 's3cret!')

      expect(makeRequest).toHaveBeenCalledWith(
        '/gateway/register',
        'POST',
        expect.objectContaining({
          body: JSON.stringify({ email: 'new@unibo.it', password: 's3cret!', name: '' }),
        }),
      )
    })

    it('reports an already-registered error on a 409 without hydrating the store', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        ok: false,
        status: 409,
      } as unknown as Response)

      const { registerWithPassword } = useKeycloakAuth()
      const result = await registerWithPassword('taken@unibo.it', 's3cret!')

      expect(result).toEqual({ ok: false, error: 'emailAlreadyRegistered' })
      expect(useAuthStore).not.toHaveBeenCalled()
    })

    it('reports a generic error for any other failure status', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        ok: false,
        status: 503,
      } as unknown as Response)

      const { registerWithPassword } = useKeycloakAuth()
      const result = await registerWithPassword('new@unibo.it', 's3cret!')

      expect(result).toEqual({ ok: false, error: 'authErrorGeneric' })
    })
  })
})
