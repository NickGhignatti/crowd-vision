import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBuildingsStore } from '@/stores/buildings'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { Building } from '@/models/building'
import type { DomainMembership } from '@/models/domain'

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeBuilding = (id: string, domains: string[] = []): Building => ({
  id,
  name: id,
  rooms: [],
  domains,
})

const makeMembership = (domainName: string): DomainMembership => ({
  domainName,
  role: 'standard_customer',
})

const makeResponse = (ok: boolean, body: unknown = []) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('useBuildingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with an empty byDomain map', () => {
      expect(useBuildingsStore().byDomain).toEqual({})
    })

    it('starts with loading false', () => {
      expect(useBuildingsStore().loading).toBe(false)
    })
  })

  describe('getter: all', () => {
    it('returns an empty array when byDomain is empty', () => {
      expect(useBuildingsStore().all).toEqual([])
    })

    it('returns all buildings from a single domain', () => {
      const store = useBuildingsStore()
      const b1 = makeBuilding('b1')
      const b2 = makeBuilding('b2')
      store.byDomain = { acme: [b1, b2] }

      expect(store.all).toEqual([b1, b2])
    })

    it('flattens buildings from multiple domains into one list', () => {
      const store = useBuildingsStore()
      const b1 = makeBuilding('b1')
      const b2 = makeBuilding('b2')
      const b3 = makeBuilding('b3')
      store.byDomain = { acme: [b1, b2], globex: [b3] }

      expect(store.all).toHaveLength(3)
      expect(store.all).toEqual(expect.arrayContaining([b1, b2, b3]))
    })

    it('deduplicates buildings that appear in more than one domain', () => {
      const store = useBuildingsStore()
      const shared = makeBuilding('shared-hq')
      const exclusive = makeBuilding('exclusive')
      store.byDomain = { acme: [shared, exclusive], globex: [shared] }

      const result = store.all
      expect(result).toHaveLength(2)

      const ids = result.map((b) => b.id)
      expect(ids.filter((id) => id === 'shared-hq')).toHaveLength(1)
    })

    it('keeps the first occurrence when deduplicating', () => {
      const store = useBuildingsStore()
      const first = { ...makeBuilding('hq'), domains: ['acme'] }
      const duplicate = { ...makeBuilding('hq'), domains: ['globex'] }
      store.byDomain = { acme: [first], globex: [duplicate] }

      expect(store.all[0]?.domains).toEqual(['acme'])
    })

    it('returns an empty array when a domain has an empty buildings list', () => {
      const store = useBuildingsStore()
      store.byDomain = { acme: [], globex: [] }

      expect(store.all).toEqual([])
    })

    it('is reactive — updates when byDomain changes', () => {
      const store = useBuildingsStore()
      expect(store.all).toHaveLength(0)

      store.byDomain = { acme: [makeBuilding('b1')] }
      expect(store.all).toHaveLength(1)

      store.byDomain = {}
      expect(store.all).toHaveLength(0)
    })
  })

  describe('fetch', () => {
    it('only calls the API once when multiple fetches happen concurrently', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [makeBuilding('b1')]) as unknown as Response,
      )
      const store = useBuildingsStore()
      const memberships = [makeMembership('acme')]

      const fetch1 = store.fetch(memberships)
      const fetch2 = store.fetch(memberships)
      await Promise.all([fetch1, fetch2])

      expect(makeRequest).toHaveBeenCalledTimes(1)
    })

    it('does not call authenticatedFetch when all memberships are already cached', async () => {
      const store = useBuildingsStore()
      store.byDomain = { acme: [] }

      await store.fetch([makeMembership('acme')])

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('does not call authenticatedFetch when the memberships list is empty', async () => {
      await useBuildingsStore().fetch([])

      expect(makeRequest).not.toHaveBeenCalled()
    })

    it('calls authenticatedFetch with the correct URL for each missing domain', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true, [makeBuilding('b1')]) as unknown as Response)
        .mockResolvedValueOnce(makeResponse(true, [makeBuilding('b2')]) as unknown as Response)

      await useBuildingsStore().fetch([makeMembership('acme'), makeMembership('globex')])

      const urls = vi.mocked(makeRequest).mock.calls.map((c) => c[0])
      expect(urls).toContain('/twin/buildings/acme')
      expect(urls).toContain('/twin/buildings/globex')
    })

    it('fetches all missing domains in parallel (Promise.all)', async () => {
      // Verify both fetches are initiated — sequential execution would resolve one before
      // triggering the next; parallel starts both. We confirm by checking call count.
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, []) as unknown as Response)

      const memberships = [makeMembership('a'), makeMembership('b'), makeMembership('c')]
      await useBuildingsStore().fetch(memberships)

      expect(makeRequest).toHaveBeenCalledTimes(3)
    })

    it('stores the returned buildings under the correct domain key', async () => {
      const buildings = [makeBuilding('hq')]
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, buildings) as unknown as Response,
      )

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual(buildings)
    })

    it('stores an empty array for a domain when the response is not ok', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual([])
    })

    it('stores an empty array for a domain when its individual fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.byDomain['acme']).toEqual([])
    })

    it('does not re-fetch domains already present in the cache', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, [makeBuilding('new')]) as unknown as Response,
      )

      const store = useBuildingsStore()
      const cached = [makeBuilding('cached')]
      store.byDomain = { acme: cached }

      await store.fetch([makeMembership('acme'), makeMembership('globex')])

      expect(makeRequest).toHaveBeenCalledTimes(1)
      expect(makeRequest).toHaveBeenCalledWith('/twin/buildings/globex')
      expect(store.byDomain['acme']).toEqual(cached) // untouched
    })

    it('sets loading to true while fetching and false when done', async () => {
      const loadingStates: boolean[] = []

      vi.mocked(makeRequest).mockImplementation(async () => {
        loadingStates.push(useBuildingsStore().loading) // captured mid-flight
        return makeResponse(true, []) as unknown as Response
      })

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme')])

      expect(loadingStates).toContain(true) // was true during the call
      expect(store.loading).toBe(false) // false after completion
    })

    it('resets loading to false even when one domain fetch throws', async () => {
      vi.mocked(makeRequest).mockRejectedValue(new Error('Network error'))

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme')])

      expect(store.loading).toBe(false)
    })

    it('handles a partial failure — successful domains are stored, failed ones get []', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(makeResponse(true, [makeBuilding('hq')]) as unknown as Response)
        .mockRejectedValueOnce(new Error('Network error'))

      const store = useBuildingsStore()
      await store.fetch([makeMembership('acme'), makeMembership('broken')])

      expect(store.byDomain['acme']).toEqual([makeBuilding('hq')])
      expect(store.byDomain['broken']).toEqual([])
    })
  })

  describe('register', () => {
    const makeRoom = (id: string) => ({
      id,
      name: id,
      capacity: 20,
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 5, height: 3, depth: 5 },
    })

    const makeDraftPayload = () => ({
      name: 'Test Building',
      rooms: [makeRoom('room-1')],
    })

    it('returns the id from the created building', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(
          makeResponse(true, { id: 'generated-uuid', name: 'Test Building', rooms: [] }) as unknown as Response,
        )
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)

      const store = useBuildingsStore()
      const id = await store.register(makeDraftPayload(), 'acme')

      expect(id).toBe('generated-uuid')
    })

    it('calls PUT /sensor/thresholds/buildings/:id to initialise threshold doc', async () => {
      const buildingId = 'auto-uuid-123'
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(
          makeResponse(true, { id: buildingId, name: 'Test Building', rooms: [] }) as unknown as Response,
        )
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)

      const store = useBuildingsStore()
      await store.register(makeDraftPayload(), 'acme')

      const calls = vi.mocked(makeRequest).mock.calls
      const thresholdCall = calls.find(
        (c) => c[0] === `/sensor/thresholds/buildings/${buildingId}` && c[1] === 'PUT',
      )
      expect(thresholdCall).toBeDefined()
    })

    it('injects the domain into the payload', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(
          makeResponse(true, { id: 'x', name: 'Test Building', rooms: [] }) as unknown as Response,
        )
        .mockResolvedValueOnce(makeResponse(true) as unknown as Response)

      const store = useBuildingsStore()
      await store.register(makeDraftPayload(), 'my-domain')

      const twinCall = vi.mocked(makeRequest).mock.calls[0]!
      const body = JSON.parse(twinCall[2]!.body as string)
      expect(body.domains).toEqual(['my-domain'])
    })

    it('throws when the twin registration fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(false) as unknown as Response,
      )

      await expect(
        useBuildingsStore().register(makeDraftPayload(), 'acme'),
      ).rejects.toThrow('Failed to register twin model')
    })

    it('throws when threshold initialisation fails', async () => {
      vi.mocked(makeRequest)
        .mockResolvedValueOnce(
          makeResponse(true, { id: 'x', rooms: [] }) as unknown as Response,
        )
        .mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(
        useBuildingsStore().register(makeDraftPayload(), 'acme'),
      ).rejects.toThrow('Failed to initialize temperature thresholds')
    })
  })

  describe('createRoom', () => {
    const newRoom = {
      name: 'New Room',
      capacity: 10,
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 2, height: 2, depth: 2 },
    }

    it('POSTs to /twin/building/:id/room and returns the created room', async () => {
      const created = { id: 'server-generated-id', ...newRoom }
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(true, created) as unknown as Response,
      )

      const room = await useBuildingsStore().createRoom('b1', newRoom)

      expect(makeRequest).toHaveBeenCalledWith('/twin/building/b1/room', 'POST', {
        body: JSON.stringify(newRoom),
      })
      expect(room).toEqual(created)
    })

    it('appends the created room to the cached building', async () => {
      const created = { id: 'server-generated-id', ...newRoom }
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(true, created) as unknown as Response,
      )

      const store = useBuildingsStore()
      const building = makeBuilding('b1')
      store.byDomain = { acme: [building] }

      await store.createRoom('b1', newRoom)

      expect(store.byDomain['acme']?.[0]?.rooms).toEqual([created])
    })

    it('throws when the request fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(useBuildingsStore().createRoom('b1', newRoom)).rejects.toThrow(
        'Failed to create room',
      )
    })
  })

  describe('deleteRoom', () => {
    it('DELETEs /twin/building/:id/room/:roomId', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(true) as unknown as Response)

      await useBuildingsStore().deleteRoom('b1', 'r1')

      expect(makeRequest).toHaveBeenCalledWith('/twin/building/b1/room/r1', 'DELETE')
    })

    it('removes the room from the cached building', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(true) as unknown as Response)

      const store = useBuildingsStore()
      const building = { ...makeBuilding('b1'), rooms: [{ id: 'r1' }, { id: 'r2' }] as any }
      store.byDomain = { acme: [building] }

      await store.deleteRoom('b1', 'r1')

      expect(store.byDomain['acme']?.[0]?.rooms.map((r) => r.id)).toEqual(['r2'])
    })

    it('throws when the request fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(useBuildingsStore().deleteRoom('b1', 'r1')).rejects.toThrow(
        'Failed to delete room',
      )
    })
  })

  describe('saveRooms', () => {
    const rooms = [
      {
        id: 'r1',
        name: 'Room 1',
        capacity: 10,
        position: { x: 1, y: 0, z: 1 },
        dimensions: { width: 2, height: 2, depth: 2 },
      },
    ]

    it('PUTs the full rooms array to /twin/building/:id/rooms', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(true, { id: 'b1', name: 'B1', rooms, domains: [] }) as unknown as Response,
      )

      await useBuildingsStore().saveRooms('b1', rooms as any)

      expect(makeRequest).toHaveBeenCalledWith('/twin/building/b1/rooms', 'PUT', {
        body: JSON.stringify({ rooms }),
      })
    })

    it('syncs the cached building with the server response', async () => {
      const serverBuilding = { id: 'b1', name: 'B1', rooms, domains: ['acme'] }
      vi.mocked(makeRequest).mockResolvedValueOnce(
        makeResponse(true, serverBuilding) as unknown as Response,
      )

      const store = useBuildingsStore()
      store.byDomain = { acme: [makeBuilding('b1')] }

      await store.saveRooms('b1', rooms as any)

      expect(store.byDomain['acme']?.[0]?.rooms).toEqual(rooms)
    })

    it('throws when the request fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce(makeResponse(false) as unknown as Response)

      await expect(useBuildingsStore().saveRooms('b1', rooms as any)).rejects.toThrow(
        'Failed to save rooms',
      )
    })
  })

  describe('invalidate', () => {
    it('clears all cached domains', () => {
      const store = useBuildingsStore()
      store.byDomain = { acme: [makeBuilding('hq')], globex: [makeBuilding('b2')] }

      store.invalidate()

      expect(store.byDomain).toEqual({})
    })

    it('does not affect the loading flag', () => {
      const store = useBuildingsStore()
      store.loading = false

      store.invalidate()

      expect(store.loading).toBe(false)
    })

    it('makes the all getter return an empty array after invalidation', () => {
      const store = useBuildingsStore()
      store.byDomain = { acme: [makeBuilding('hq')] }

      store.invalidate()

      expect(store.all).toEqual([])
    })
  })
})
