import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { Building } from '@/models/building'
import type { DomainMembership } from '@/models/domain'

const PROVISIONING_POLL_MS = 500
const PROVISIONING_TIMEOUT_MS = 30_000

// Waits for an accepted upload to become a twin. `ready` also means the sensor
// threshold clone landed -- digital-twin fails the upload if that call is
// refused -- so there is nothing left for the browser to initialise afterwards.
async function awaitProvisioned(buildingId: string): Promise<void> {
  const deadline = Date.now() + PROVISIONING_TIMEOUT_MS

  for (;;) {
    const res = await makeRequest(`/twin/building/${buildingId}/status`)
    const status = res.ok ? (await res.json()).status : null

    if (status === 'ready') return
    if (status === 'failed') {
      throw new Error('Failed to build the twin model')
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the twin model to be built')
    }
    await new Promise((resolve) => setTimeout(resolve, PROVISIONING_POLL_MS))
  }
}

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
    getById(): (id: string) => Building | undefined {
      return (id: string) => {
        return this.all.find((building) => building.id === id)
      }
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

    async register(payload: any, targetUploadDomain: string): Promise<string> {
      // Already normalized in loadFromJson (room name fallback), so no need to repeat it here.

      if (targetUploadDomain && targetUploadDomain !== '') {
        payload.domains = [targetUploadDomain]
      }

      const response = await makeRequest(`/twin/register`, 'POST', {
        body: JSON.stringify(payload),
      })

      // A malformed description is refused here, synchronously. Anything else
      // comes back as 202: accepted for provisioning, not yet built.
      if (!response.ok) {
        throw new Error('Failed to register twin model')
      }

      const { buildingId } = await response.json()
      await awaitProvisioned(buildingId)
      return buildingId
    },

    // A room's shape, name and capacity come from the uploaded model and are
    // read-only afterwards; its alert threshold is telemetry's, not the twin's,
    // so it stays writable.
    async updateRoomThreshold(buildingId: string, roomId: string, maxTemperature: number) {
      const res = await makeRequest(
        `/telemetry/thresholds/buildings/${buildingId}/rooms/${roomId}`,
        'PATCH',
        { body: JSON.stringify({ maxTemperature }) },
      )
      if (!res.ok) {
        throw new Error('Failed to update room threshold')
      }

      for (const domain in this.byDomain) {
        const room = this.byDomain[domain]
          ?.find((b) => b.id === buildingId)
          ?.rooms?.find((r) => r.id === roomId)
        if (room) room.maxTemperature = maxTemperature
      }
    },

    async updateBuildingConfig(buildingId: string, updates: Partial<Building>) {
      const res = await makeRequest(`/twin/building/${buildingId}`, 'PATCH', {
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        throw new Error('Failed to update building geometry')
      }

      // Automatically sync the store state with the new updates
      for (const domain in this.byDomain) {
        const building = this.byDomain[domain]?.find((b) => b.id === buildingId)
        if (building) {
          Object.assign(building, updates)
        }
      }
    },

    invalidate() {
      this.byDomain = {}
      this._fetchPromise = null
    },
  },
})
