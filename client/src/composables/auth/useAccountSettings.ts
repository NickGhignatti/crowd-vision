import { makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'

// Account settings — self-service profile read/update, and password change.
// Unlike the JWT (StandardClaims), email/name are fetched live from
// claims-gateway's /gateway/profile on demand, never carried in the session
// cookie every request sends.
export function useAccountSettings() {
  async function fetchProfile(): Promise<{
    ok: boolean
    email?: string
    name?: string
    picture?: string
  }> {
    const res = await makeRequest('/gateway/profile')
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: true, email: data.email, name: data.name, picture: data.picture }
  }

  async function updateProfile(
    email: string,
    name: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await makeRequest('/gateway/profile', 'PATCH', {
      body: JSON.stringify({ email, name }),
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 409 ? 'emailAlreadyRegistered' : 'authErrorGeneric' }
    }
    await useAuthStore().hydrate(true)
    return { ok: true }
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await makeRequest('/gateway/profile/password', 'POST', {
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? 'invalidCredentials' : 'authErrorGeneric' }
    }
    return { ok: true }
  }

  return { fetchProfile, updateProfile, changePassword }
}
