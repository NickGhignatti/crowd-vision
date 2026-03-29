import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi'
import type { Building } from '@/models/building'
import type { DomainMembership } from '@/models/domain'

export const useBuildingsStore = defineStore('buildings', {
  state: () => ({
    byDomain: {} as Record<string, Building[]>,
    loading: false,
    _fetchPromise: null as Promise<void> | null,
  }),

  getters: {
    // Flat deduplicated list across all domains
    all(state): Building[] {
      const seen = new Set<string>()
      return Object.values(state.byDomain)
        .flat()
        .filter((b) => {
          if (seen.has(b.id)) return false
          seen.add(b.id)
          return true
        })
    },
  },

  actions: {
    async fetch(memberships: DomainMembership[]): Promise<void> {
      if (this._fetchPromise) {
        return this._fetchPromise.then(() => this.fetch(memberships))
      }
      // Only fetch domains not yet in cache
      const missing = memberships.filter((m) => !(m.domainName in this.byDomain))
      if (missing.length === 0) return Promise.resolve()

      this.loading = true
      this._fetchPromise = (async () => {
        try {
          await Promise.all(
            missing.map(async (m) => {
              try {
                const res = await makeRequest(`/twin/buildings/${m.domainName}`)
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
