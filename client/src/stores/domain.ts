import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi'
import { useAuthStore } from './authentication'
import type { DomainMembership, Domain } from '@/models/domain'

export const useDomainsStore = defineStore('domains', {
  state: () => ({
    memberships: null as DomainMembership[] | null,
    allDomains: null as Domain[] | null,
    loading: false,
    loadingAll: false,
    _membershipsPromise: null as Promise<void> | null,
    _allDomainsPromise: null as Promise<void> | null,
  }),

  actions: {
    async fetchMemberships() {
      if (this.memberships !== null) return Promise.resolve()

      // If a fetch is currently in progress, return that existing promise
      // so the caller awaits the same request instead of resolving instantly.
      if (this._membershipsPromise) return this._membershipsPromise

      this.loading = true
      this._membershipsPromise = ( async () => {
        try {
          const { accountName } = useAuthStore()
          const res = await makeRequest(`/auth/domains/${accountName}`)
          const data = await res.json()
          this.memberships = res.ok ? (data.domains ?? []) : []
        } finally {
          this.loading = false
          this._membershipsPromise = null
        }
      })()

      return this._membershipsPromise
    },

    async fetchAll() {
      if (this.allDomains !== null) return Promise.resolve()
      if (this._allDomainsPromise) return this._allDomainsPromise

      this.loadingAll = true
      this._allDomainsPromise = ( async () => {
        try {
          const res = await makeRequest('/auth/domains')
          const data = await res.json()
          this.allDomains = res.ok ? (data.domains ?? []) : []
        } finally {
          this.loadingAll = false
          this._allDomainsPromise = null
        }
      })()

      return this._allDomainsPromise
    },

    invalidate() {
      this.memberships = null
      this.allDomains = null
      this._membershipsPromise = null
      this._allDomainsPromise = null
    },
  },
})

export const useSubdomainsStore = defineStore('subdomains', {
  state: () => ({
    byDomain: {} as Record<string, string[]>,
    loading: false,
    _fetchPromise: null as Promise<void> | null,
  }),

  actions: {
    async fetch(memberships: DomainMembership[]): Promise<void> {
      if (this._fetchPromise) {
        await this._fetchPromise
        return await this.fetch(memberships)
      }

      const missing = memberships.filter((m) => !(m.domainName in this.byDomain))
      if (missing.length === 0) return Promise.resolve()

      this.loading = true

      this._fetchPromise = (async () => {
        try {
          await Promise.allSettled(
            missing.map(async (m) => {
              try {
                const res = await makeRequest(`/auth/subdomains/${m.domainName}`)
                this.byDomain[m.domainName] = res.ok ? await res.json() : []
              } catch {
                this.byDomain[m.domainName] = []
              }
            }),
          )
        } finally {
          this.loading = false
          this._fetchPromise = null
        }
      })()

      return this._fetchPromise
    },

    invalidate() {
      this.byDomain = {}
      this._fetchPromise = null
    },
  },
})
