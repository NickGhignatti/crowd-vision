import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/core/useApi.ts'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'

export const useAuthStore = defineStore('authentication', {
  state: () => ({
    accountName: null as string | null,
    // The gateway JWT's `sub` — needed to address the caller's own membership row (e.g.
    // DELETE /tenancy/domains/{domain}/members/{accountId}), since the cookie is HttpOnly.
    accountId: null as string | null,
    isAuthenticated: false,
    isHydrated: false, // has the /me call completed?
    _hydratePromise: null as Promise<void> | null,
  }),

  actions: {
    // Completes the Keycloak login: exchanges the already-obtained ID token (see
    // useKeycloakAuth.ts) with claims-gateway for the session cookie; returns whether it succeeded.
    async completeLogin(idToken: string): Promise<boolean> {
      const res = await makeRequest('/gateway/exchange', 'POST', {
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) return false
      await this.hydrate(true)
      return this.isAuthenticated
    },

    // Re-mints the session cookie so a membership change this session (create/join domain,
    // redeem invite) lands in the gateway JWT — otherwise the mesh 403s against the stale token.
    async refreshSession(): Promise<void> {
      await makeRequest('/gateway/refresh', 'POST')
    },

    async logout() {
      await makeRequest('/gateway/logout', 'POST')
      this.accountName = null
      this.accountId = null
      this.isAuthenticated = false
      useDomainsStore().$reset()
      useBuildingsStore().$reset()
      useSubdomainsStore().$reset()
    },

    // Called on app startup (and after completeLogin) to re-hydrate from the cookie. force=true
    // bypasses the "already hydrated" short circuit needed right after a prior anonymous hydrate().
    async hydrate(force = false) {
      if (this.isHydrated && !force) return Promise.resolve()
      if (this._hydratePromise) return this._hydratePromise

      this._hydratePromise = (async () => {
        try {
          const res = await makeRequest('/gateway/me')
          if (res.ok) {
            const data = await res.json()
            this.accountName = data.accountName
            this.accountId = data.sub
            this.isAuthenticated = true
          } else {
            this.accountName = null
            this.accountId = null
            this.isAuthenticated = false
          }
        } catch {
          // Cookie missing or expired — user is logged out, do nothing
        } finally {
          this.isHydrated = true
          this._hydratePromise = null
        }
      })()

      return this._hydratePromise
    },
  },
})
