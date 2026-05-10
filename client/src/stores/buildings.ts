import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/core/useApi.ts'
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

    async register(payload: any, targetUploadDomain: string) {
      payload.name =
        typeof payload?.name === 'string' && payload.name.trim() ? payload.name : payload?.id

      if (Array.isArray(payload.rooms)) {
        payload.rooms = payload.rooms.map((room: any) => ({
          ...room,
          name: typeof room?.name === 'string' && room.name.trim() ? room.name : room?.id,
        }))
      }

      if (targetUploadDomain && targetUploadDomain != '') {
        payload.domains = [targetUploadDomain]
      }

      const response = await makeRequest(`/twin/register`, 'POST', {
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to register twin model')
      }

      const createdBuilding = await response.json()

      const thresholdResponse = await makeRequest('/sensor/thresholds/buildings', 'POST', {
        body: JSON.stringify({
          buildingId: createdBuilding.id,
          rooms: Array.isArray(createdBuilding.rooms)
            ? createdBuilding.rooms.map((room: any) => ({
                id: room.id,
              }))
            : [],
        }),
      })

      if (!thresholdResponse.ok) {
        throw new Error('Failed to initialize temperature thresholds')
      }
    },

    async updateRoomConfig(buildingId: string, roomId: string, updates: any) {
      const { maxTemperature, ...geometryUpdates } = updates

      const hasGeometryUpdates = Object.keys(geometryUpdates).length > 0
      if (hasGeometryUpdates) {
        const geometryResponse = await makeRequest(
          `/twin/building/${buildingId}/room/${roomId}`,
          'PATCH',
          { body: JSON.stringify(geometryUpdates) },
        )
        if (!geometryResponse.ok) {
          throw new Error('Failed to update room geometry')
        }
      }

      if (typeof maxTemperature === 'number') {
        const thresholdResponse = await makeRequest(
          `/sensor/thresholds/buildings/${buildingId}/rooms/${roomId}`,
          'PATCH',
          { body: JSON.stringify({ maxTemperature }) },
        )
        if (!thresholdResponse.ok) {
          throw new Error('Failed to update room threshold')
        }
      }

      // Automatically sync the store state with the new updates
      for (const domain in this.byDomain) {
        const building = this.byDomain[domain]?.find((b) => b.id === buildingId)
        if (building && building.rooms) {
          const room = building.rooms.find((r) => r.id === roomId)
          if (room) {
            Object.assign(room, updates)
          }
        }
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
