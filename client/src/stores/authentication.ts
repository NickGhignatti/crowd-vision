import { defineStore } from 'pinia'
import { nonAuthenticatedFetch, authenticatedFetch } from '@/composables/useApi'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'

export const useAuthStore = defineStore('authentication', {
  state: () => ({
    accountName: null as string | null,
    isAuthenticated: false,
    isHydrated: false, // has the /me call completed?
  }),

  actions: {
    async login(accountName: string, password: string) {
      const res = await nonAuthenticatedFetch('/auth/login', 'POST', {
        body: JSON.stringify({ accountName, password }),
      })
      if (!res.ok) throw new Error('Login failed')
      const data = await res.json()
      this.accountName = data.account.accountName
      this.isAuthenticated = true
    },

    async register(accountName: string, email: string, password: string, otp?: string) {
      const payload: Record<string, string> = { accountName, email, password }
      if (otp) payload.otp = otp

      const res = await nonAuthenticatedFetch('/auth/register', 'POST', {
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Registration failed')
      const data = await res.json()
      this.accountName = data.account.accountName
      this.isAuthenticated = true
    },

    async logout() {
      await authenticatedFetch('/auth/logout', 'POST')
      this.accountName = null
      this.isAuthenticated = false
      useDomainsStore().$reset()
      useBuildingsStore().$reset()
      useSubdomainsStore().$reset()
    },

    // Called once on app startup to re-hydrate from the cookie
    async hydrate() {
      try {
        const res = await authenticatedFetch('/auth/me')
        if (res.ok) {
          const data = await res.json()
          this.accountName = data.accountName
          this.isAuthenticated = true
        }
      } catch {
        // Cookie missing or expired — user is logged out, do nothing
      } finally {
        this.isHydrated = true
      }
    },
  },
})
