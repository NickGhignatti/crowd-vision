import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from './authentication'
import type { DomainMembership, Domain } from '@/models/domain'
import type { DomainRow, DomainToAddWithVisibilityPayload } from '@/interfaces/domain'

// Roles a business_admin can mint an invite code for — mirrors auth-contracts'
// role ladder minus the platform-level "admin" role, which is never
// domain-scoped. tenancy-service itself enforces who may actually redeem
// each code; this list only decides which QR tabs getDomainQRs offers.
const INVITABLE_ROLES = ['business_admin', 'business_staff', 'standard_customer']

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
          const res = await makeRequest('/tenancy/me/memberships')
          if (!res.ok) {
            this.memberships = []
            return
          }
          const data: { domain: string; role: string; externalId?: string }[] = await res.json()
          this.memberships = Array.isArray(data)
            ? data.map((m) => ({
                domainName: m.domain,
                role: m.role,
                externalId: m.externalId,
              }))
            : []
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
          const res = await makeRequest('/tenancy/domains')
          if (!res.ok) {
            this.allDomains = []
            return
          }
          const data: Domain[] = await res.json()
          this.allDomains = Array.isArray(data) ? data : []
        } finally {
          this.loadingAll = false
          this._allDomainsPromise = null
        }
      })()

      return this._allDomainsPromise
    },

    // No network call: tenancy-service's GET /domains already embeds each
    // domain's live member count, so fetchAll has everything this needs.
    async fetchMemberCounts() {
      const counts: Record<string, number> = {}
      for (const d of this.allDomains ?? []) {
        counts[d.name] = d.memberCount ?? 0
      }
      this.memberCounts = counts
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

    async createNewDomain(payload: DomainToAddWithVisibilityPayload) {
      const masterDomain = payload.masterDomain?.trim().toLowerCase()
      const endpoint = masterDomain
        ? `/tenancy/domains/${encodeURIComponent(masterDomain)}/subdomains`
        : '/tenancy/domains'

      const normalizedName = payload.name.trim().toLowerCase()
      const domainName =
        masterDomain && !normalizedName.endsWith(`.${masterDomain}`)
          ? `${normalizedName}.${masterDomain}`
          : normalizedName

      const response = await makeRequest(endpoint, 'POST', {
        body: JSON.stringify({
          name: domainName,
          // No separate display-name field in the creation UI (yet) — the
          // submitted name doubles as both, same as the old auth-service form.
          displayName: domainName,
          isPublic: payload.isVisibleFromOutside,
        }),
      })

      if (!response.ok) {
        // tenancy-service's error body is plain text (http.Error), not JSON.
        const message = await response.text().catch(() => '')
        throw new Error(message || 'Failed to create domain')
      }

      return await response.json()
    },

    // Self-service join for a domain whose join_policy allows it
    // (open-via-idp) — replaces the old internal/OIDC branch entirely; OIDC
    // per-domain login no longer exists, Keycloak is the only IdP now.
    async subscribeToDomain(domain: { name: string }) {
      const response = await makeRequest(
        `/tenancy/domains/${encodeURIComponent(domain.name)}/join`,
        'POST',
        { body: JSON.stringify({ role: 'standard_customer' }) },
      )

      if (!response.ok) throw new Error(`Failed to subscribe to ${domain.name}`)

      await this.fetchMemberships(true)
    },

    async unsubscribeFromDomain(domainName: string) {
      const accountId = this._authStore.accountId
      if (!accountId) throw new Error('Missing account id in auth store')

      const response = await makeRequest(
        `/tenancy/domains/${encodeURIComponent(domainName)}/members/${accountId}`,
        'DELETE',
      )

      if (!response.ok) throw new Error(`Failed to unsubscribe from ${domainName}`)

      await this.fetchMemberships(true)
    },

    // Replaces the old TOTP-QR flow: mints one invite code per grantable role
    // and hands the raw codes back keyed by role. QrCodeCard already turns any
    // string into a QR image, so an invite code works as a drop-in payload for
    // what used to be an otpauth:// URI — no changes needed there.
    async getDomainQRs(domainName: string) {
      const qrCodes: Record<string, string> = {}

      await Promise.all(
        INVITABLE_ROLES.map(async (role) => {
          try {
            const response = await makeRequest(
              `/tenancy/domains/${encodeURIComponent(domainName)}/invite-codes`,
              'POST',
              { body: JSON.stringify({ role }) },
            )
            if (!response.ok) return
            const data = await response.json()
            qrCodes[role] = data.code
          } catch {
            // Best-effort per role — e.g. a caller who isn't business_admin
            // of this domain simply won't get any code back.
          }
        }),
      )

      return qrCodes
    },

    // The joining-side counterpart to getDomainQRs — redeems a code minted by
    // a business_admin, replacing the old TOTP-QR "scan to join" flow with
    // "paste the code you were given".
    async redeemInviteCode(code: string) {
      const response = await makeRequest(
        `/tenancy/invite-codes/${encodeURIComponent(code.trim())}/redeem`,
        'POST',
      )

      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || 'Failed to redeem invite code')
      }

      await this.fetchMemberships(true)
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
                const res = await makeRequest(
                  `/tenancy/domains/${encodeURIComponent(m.domainName)}/subdomains`,
                )
                const data: { name: string }[] = res.ok ? await res.json() : []
                this.byDomain[m.domainName] = Array.isArray(data) ? data.map((d) => d.name) : []
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
