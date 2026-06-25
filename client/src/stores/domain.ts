import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from './authentication'
import type { DomainMembership, Domain } from '@/models/domain'
import type { DomainRow } from '@/interfaces/domain'

export const useDomainsStore = defineStore('domains', {
  state: () => ({
    memberships: null as DomainMembership[] | null,
    allDomains: null as Domain[] | null,
    memberCounts: {} as Record<string, number>,
    buildingCounts: {} as Record<string, number>,
    loading: false,
    loadingAll: false,
    _membershipsPromise: null as Promise<void> | null,
    _allDomainsPromise: null as Promise<void> | null,
    _authStore: useAuthStore(),
  }),

  getters: {
    // Public domains plus the private domains the user belongs to, with role and
    // counts overlaid. A joined public domain appears once (not duplicated).
    unifiedDomains(state): DomainRow[] {
      const publicDomains = state.allDomains ?? []
      const memberships = state.memberships ?? []
      const roleByName = new Map(memberships.map((m) => [m.domainName, m.role]))
      const publicNames = new Set(publicDomains.map((d) => d.name))

      const withCounts = (row: Omit<DomainRow, 'memberCount' | 'buildingCount'>): DomainRow => ({
        ...row,
        memberCount: state.memberCounts[row.name],
        buildingCount: state.buildingCounts[row.name],
      })

      const publicRows: DomainRow[] = publicDomains.map((d) =>
        withCounts({
          name: d.name,
          authStrategy: d.authStrategy,
          isPrivate: false,
          role: roleByName.get(d.name),
          isSubscribed: roleByName.has(d.name),
        }),
      )

      const privateRows: DomainRow[] = memberships
        .filter((m) => !publicNames.has(m.domainName))
        .map((m) =>
          withCounts({
            name: m.domainName,
            isPrivate: true,
            role: m.role,
            isSubscribed: true,
          }),
        )

      return [...publicRows, ...privateRows]
    },
  },

  actions: {
    async fetchMemberships(forceRefresh = false) {
      if (!forceRefresh && this.memberships !== null) return Promise.resolve()
      if (!forceRefresh && this._membershipsPromise) return this._membershipsPromise

      this.loading = true
      this._membershipsPromise = (async () => {
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

    async fetchAll(forceRefresh = false) {
      if (!forceRefresh && this.allDomains !== null) return Promise.resolve()
      if (!forceRefresh && this._allDomainsPromise) return this._allDomainsPromise

      this.loadingAll = true
      this._allDomainsPromise = (async () => {
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

    async fetchMemberCounts() {
      try {
        const res = await makeRequest('/auth/domains/member-counts')
        const data = await res.json()
        this.memberCounts = res.ok ? (data.counts ?? {}) : {}
      } catch {
        this.memberCounts = {}
      }
    },

    async fetchBuildingCounts(domainNames: string[]) {
      if (domainNames.length === 0) {
        this.buildingCounts = {}
        return
      }
      try {
        const res = await makeRequest('/twin/buildings/counts', 'POST', {
          body: JSON.stringify({ domains: domainNames }),
        })
        const data = await res.json()
        this.buildingCounts = res.ok ? (data.counts ?? {}) : {}
      } catch {
        this.buildingCounts = {}
      }
    },

    async createNewDomain(payload: any) {
      const accountName = this._authStore.accountName
      if (!accountName) throw new Error('Missing account name in auth store')

      const masterDomain = payload.masterDomain?.trim().toLowerCase()
      const endpoint = masterDomain
        ? `/auth/subdomains/${encodeURIComponent(masterDomain)}`
        : '/auth/domains'

      const normalizedName = payload.name.trim().toLowerCase()
      const domainName =
        masterDomain && !normalizedName.endsWith(`.${masterDomain}`)
          ? `${normalizedName}.${masterDomain}`
          : normalizedName

      const body = {
        ...payload,
        name: domainName,
        creatorUsername: accountName,
      }

      delete body.masterDomain

      const response = await makeRequest(endpoint, 'POST', {
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to creation domain')
      }

      return await response.json()
    },

    async subscribeToDomain(domain: { name: string; authStrategy?: 'internal' | 'oidc' }) {
      const accountName = this._authStore.accountName
      if (!accountName) throw new Error('Missing account name in auth store')

      if (domain.authStrategy === 'oidc') {
        const response = await makeRequest(
          `/auth/sso/login/${domain.name}?accountName=${accountName}`,
        )
        if (!response.ok) throw new Error('Failed to initiate SSO')

        const data = await response.json()
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl
        }
        return
      }

      // Internal Strategy
      const response = await makeRequest(`/auth/domains/${accountName}/subscribe`, 'POST', {
        body: JSON.stringify({ domainName: domain.name }),
      })

      if (!response.ok) throw new Error(`Failed to subscribe to ${domain.name}`)

      await this.fetchMemberships(true)
    },

    async unsubscribeFromDomain(domainName: string) {
      const accountName = this._authStore.accountName
      if (!accountName) throw new Error('Missing account name in auth store')

      const response = await makeRequest(`/auth/domains/${accountName}/unsubscribe`, 'DELETE', {
        body: JSON.stringify({ domainName }),
      })

      if (!response.ok) throw new Error(`Failed to unsubscribe from ${domainName}`)

      await this.fetchMemberships(true)
    },

    async getDomainQRs(domainName: string) {
      const accountName = this._authStore.accountName
      const response = await makeRequest(`/auth/domains/${domainName}/totp/qr/${accountName}`)
      if (!response.ok) throw new Error('Failed to fetch QrCodeCard codes')
      const data = await response.json()
      return data.qrCodes
    },

    invalidate() {
      this.memberships = null
      this.allDomains = null
      this.memberCounts = {}
      this.buildingCounts = {}
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
