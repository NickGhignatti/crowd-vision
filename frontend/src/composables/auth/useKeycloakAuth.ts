import { makeExternalRequest, makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/composables/auth/pkce.ts'

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8090'
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'crowdvision'
const KEYCLOAK_CLIENT_ID = 'cv-web'

const VERIFIER_KEY = 'cv.pkce.verifier'
const STATE_KEY = 'cv.pkce.state'
const REDIRECT_KEY = 'cv.pkce.redirect'

const callbackUri = () => `${window.location.origin}/auth/callback`

function authorizationUrl(challenge: string, state: string, extraPath = '', idpHint = ''): string {
  const params = new URLSearchParams({
    client_id: KEYCLOAK_CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUri(),
    scope: 'openid',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  // kc_idp_hint tells Keycloak to skip its own login page and jump straight to
  // a brokered identity provider (e.g. 'google'). Omitted → Keycloak's own form.
  if (idpHint) params.set('kc_idp_hint', idpHint)
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect${extraPath}?${params.toString()}`
}

export function useKeycloakAuth() {
  // Redirects the whole page to Keycloak; redirectPath is where the app lands after a
  // successful callback. idpHint (optional) routes straight to a brokered provider like 'google'.
  async function beginLogin(redirectPath = '/', idpHint = ''): Promise<void> {
    await startRedirect(redirectPath, '/auth', idpHint)
  }

  // Same PKCE flow, but to Keycloak's registration form instead of login — Keycloak's hosted
  // UI handles account creation; there's no client-side registration form (see LogInModal/SignInModal).
  async function beginRegister(redirectPath = '/', idpHint = ''): Promise<void> {
    await startRedirect(redirectPath, '/registrations', idpHint)
  }

  async function startRedirect(redirectPath: string, path: string, idpHint = ''): Promise<void> {
    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    const state = generateState()

    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(REDIRECT_KEY, redirectPath)

    window.location.href = authorizationUrl(challenge, state, path, idpHint)
  }

  // Called from /auth/callback with Keycloak's query params. Returns where to route next;
  // the caller decides what "failure" means for navigation — this only reports success/failure.
  async function completeLogin(
    code: string,
    state: string,
  ): Promise<{ ok: boolean; redirectPath: string }> {
    const expectedState = sessionStorage.getItem(STATE_KEY)
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const redirectPath = sessionStorage.getItem(REDIRECT_KEY) || '/'
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(REDIRECT_KEY)

    if (!verifier || !state || state !== expectedState) {
      return { ok: false, redirectPath }
    }

    const tokenRes = await makeExternalRequest(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      'POST',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KEYCLOAK_CLIENT_ID,
          code,
          redirect_uri: callbackUri(),
          code_verifier: verifier,
        }).toString(),
      },
    )
    if (!tokenRes.ok) return { ok: false, redirectPath }

    const tokens = (await tokenRes.json()) as { id_token?: string }
    if (!tokens.id_token) return { ok: false, redirectPath }

    const ok = await useAuthStore().completeLogin(tokens.id_token)
    return { ok, redirectPath }
  }

  // In-app password login: the browser only calls claims-gateway, never Keycloak directly —
  // it holds the client secret, does the direct grant server-side, and sets the session cookie.
  async function loginWithPassword(
    username: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await makeRequest('/gateway/login', 'POST', {
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? 'invalidCredentials' : 'authErrorGeneric' }
    }
    const authStore = useAuthStore()
    await authStore.hydrate(true)
    return { ok: authStore.isAuthenticated }
  }

  // In-app registration: claims-gateway creates the Keycloak user and logs it in within the
  // same request (see service.Gateway.Register) — one call creates the account and its session.
  async function registerWithPassword(
    email: string,
    password: string,
    name = '',
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await makeRequest('/gateway/register', 'POST', {
      body: JSON.stringify({ email, password, name }),
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 409 ? 'emailAlreadyRegistered' : 'authErrorGeneric' }
    }
    const authStore = useAuthStore()
    await authStore.hydrate(true)
    return { ok: authStore.isAuthenticated }
  }

  return { beginLogin, beginRegister, completeLogin, loginWithPassword, registerWithPassword }
}
