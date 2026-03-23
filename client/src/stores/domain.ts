import { defineStore } from 'pinia'
import { authenticatedFetch } from '@/composables/useApi'
import { useAuthStore } from './authentication'
import type { DomainMembership, Domain } from '@/models/domain'

export const useDomainsStore = defineStore('domains', {
  state: () => ({
    memberships: null as DomainMembership[] | null,
    allDomains: null as Domain[] | null,
    loading: false,
    loadingAll: false,
  }),

  actions: {
    async fetchMemberships() {
      if (this.memberships !== null || this.loading) return // already cached or in-flight
      this.loading = true
      try {
        const { accountName } = useAuthStore()
        const res = await authenticatedFetch(`/auth/domains/${accountName}`)
        const data = await res.json()
        this.memberships = data.domains ?? []
      } finally {
        this.loading = false
      }
    },

    async fetchAll() {
      if (this.allDomains !== null || this.loadingAll) return
      this.loadingAll = true
      try {
        const res = await authenticatedFetch('/auth/domains')
        const data = await res.json()
        this.allDomains = data.domains ?? []
      } finally {
        this.loadingAll = false
      }
    },

    invalidate() {
      this.memberships = null
      this.allDomains = null
    },
  },
})

export const useSubdomainsStore = defineStore('subdomains', {
  state: () => ({
    byDomain: {} as Record<string, string[]>,
    loading: false,
  }),

  actions: {
    async fetch(memberships: DomainMembership[]) {
      if (this.loading) return
      const missing = memberships.filter((m) => !(m.domainName in this.byDomain))
      if (missing.length === 0) return

      this.loading = true
      try {
        await Promise.allSettled(
          missing.map(async (m) => {
            try {
              const res = await authenticatedFetch(`/auth/subdomains/${m.domainName}`)
              this.byDomain[m.domainName] = res.ok ? await res.json() : []
            } catch {
              this.byDomain[m.domainName] = []
            }
          }),
        )
      } finally {
        this.loading = false
      }
    },

    invalidate() {
      this.byDomain = {}
    },
  },
})
