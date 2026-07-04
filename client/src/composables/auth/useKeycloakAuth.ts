import { makeExternalRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/composables/auth/pkce.ts'

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8090'
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'crowdvision'
const KEYCLOAK_CLIENT_ID = 'cv-web'

const VERIFIER_KEY = 'cv.pkce.verifier'
const STATE_KEY = 'cv.pkce.state'
const REDIRECT_KEY = 'cv.pkce.redirect'

const callbackUri = () => `${window.location.origin}/auth/callback`

function authorizationUrl(challenge: string, state: string, extraPath = ''): string {
  const params = new URLSearchParams({
    client_id: KEYCLOAK_CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUri(),
    scope: 'openid',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect${extraPath}?${params.toString()}`
}

export function useKeycloakAuth() {
  // Redirects the whole page to Keycloak. redirectPath is where the app
  // lands after a successful callback (e.g. the page the user was on when
  // a protected route bounced them to login).
  async function beginLogin(redirectPath = '/'): Promise<void> {
    await startRedirect(redirectPath, '/auth')
  }

  // Same PKCE flow, but straight to Keycloak's registration form instead of
  // login — Keycloak's own hosted UI handles account creation; there is no
  // client-side registration form anymore (see LogInModal/SignInModal).
  async function beginRegister(redirectPath = '/'): Promise<void> {
    await startRedirect(redirectPath, '/registrations')
  }

  async function startRedirect(redirectPath: string, path: string): Promise<void> {
    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    const state = generateState()

    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(REDIRECT_KEY, redirectPath)

    window.location.href = authorizationUrl(challenge, state, path)
  }

  // Called from the /auth/callback view with the query params Keycloak
  // redirected back with. Returns where to route the user next; the caller
  // decides what "failure" means for navigation (e.g. back to home with an
  // error banner) — this function only reports success/failure.
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

  return { beginLogin, beginRegister, completeLogin }
}
