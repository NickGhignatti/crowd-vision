import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi'
import type { Building } from '@/models/building'
import type { DomainMembership } from '@/models/domain'

export const useBuildingsStore = defineStore('buildings', {
  state: () => ({
    byDomain: {} as Record<string, Building[]>,
    loading: false,
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
    async fetch(memberships: DomainMembership[]) {
      if (this.loading) return
      // Only fetch domains not yet in cache
      const missing = memberships.filter((m) => !(m.domainName in this.byDomain))
      if (missing.length === 0) return

      this.loading = true
      try {
        // All domains fetched in parallel — the key fix vs the old sequential loop
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
      }
    },

    invalidate() {
      this.byDomain = {}
    },
  },
})
