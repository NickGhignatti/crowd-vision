import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi'
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
      const res = await makeRequest('/auth/login', 'POST', {
        body: JSON.stringify({ accountName, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.log(`Failed to login: ${data.type} - ${data.message}`)
        return;
      }
      this.accountName = data.account.accountName
      this.isAuthenticated = true
    },

    async register(accountName: string, email: string, password: string, otp?: string) {
      const payload: Record<string, string> = { accountName, email, password }
      if (otp) payload.otp = otp

      const res = await makeRequest('/auth/register', 'POST', {
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        console.log(`Failed to register: ${data.type} - ${data.message}`)
        return
      }
      this.accountName = data.account.accountName
      this.isAuthenticated = true
    },

    async logout() {
      await makeRequest('/auth/logout', 'POST')
      this.accountName = null
      this.isAuthenticated = false
      useDomainsStore().$reset()
      useBuildingsStore().$reset()
      useSubdomainsStore().$reset()
    },

    // Called once on app startup to re-hydrate from the cookie
    async hydrate() {
      try {
        const res = await makeRequest('/auth/me')
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
