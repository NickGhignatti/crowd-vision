import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import {
  useBuildingModel,
  __resetThresholdCacheForTests,
} from '@/composables/building/useBuildingModel.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { Building, Room } from '@/models/building.ts'

// vi.hoisted(): vi.fn()s needing mockRejectedValue/mockResolvedValue must live here — a
// module-scope const hits the TDZ under hoisted vi.mock() and loses proper mock typing.

const { mockFetchMemberships, mockFetchBuildings } = vi.hoisted(() => ({
  mockFetchMemberships: vi.fn<() => Promise<void>>(),
  mockFetchBuildings: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/stores/domain', () => ({
  useDomainsStore: vi.fn(),
}))

vi.mock('@/stores/buildings', () => ({
  useBuildingsStore: vi.fn(),
}))

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeRoom = (
  id: string,
  x: number,
  y: number,
  z: number,
  width = 5,
  height = 3,
  depth = 5,
): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x, y, z },
  dimensions: { width, height, depth },
})

const makeBuilding = (id: string, rooms: Room[] = []): Building => ({
  id,
  name: id,
  rooms,
  domains: ['test-domain'],
})

const makeThresholdResponse = (
  payload: Record<string, unknown>,
): Response =>
  ({
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response

const makeDomainStoreMock = (
  overrides: { memberships?: { domainName: string; role: string }[] | null } = {},
) => ({
  memberships: [{ domainName: 'test-domain', role: 'admin' }] as
    | { domainName: string; role: string }[]
    | null,
  fetchMemberships: mockFetchMemberships,
  ...overrides,
})

const makeBuildingsStoreMock = (overrides: { all?: Building[] } = {}) => ({
  all: [] as Building[],
  fetch: mockFetchBuildings,
  ...overrides,
})

describe('useBuildingModel', () => {
  let domainStoreMock: ReturnType<typeof makeDomainStoreMock>
  let buildingsStoreMock: ReturnType<typeof makeBuildingsStoreMock>

  beforeEach(() => {
    // The threshold cache is module-level and shared across tests; clear it so each test
    // sees fresh threshold fetches, unpolluted by a previous test's `hq`/`annex` results.
    __resetThresholdCacheForTests()

    mockFetchMemberships.mockReset()
    mockFetchMemberships.mockResolvedValue(undefined)
    mockFetchBuildings.mockReset()
    mockFetchBuildings.mockResolvedValue(undefined)
    vi.mocked(makeRequest).mockReset()
    vi.mocked(makeRequest).mockResolvedValue({ ok: false } as Response)

    domainStoreMock = makeDomainStoreMock()
    buildingsStoreMock = makeBuildingsStoreMock()

    vi.mocked(useDomainsStore).mockReturnValue(
      domainStoreMock as unknown as ReturnType<typeof useDomainsStore>,
    )
    vi.mocked(useBuildingsStore).mockReturnValue(
      buildingsStoreMock as unknown as ReturnType<typeof useBuildingsStore>,
    )
  })

  describe('initial state', () => {
    it('building is null', () => {
      expect(useBuildingModel().building.value).toBeNull()
    })

    it('allBuildings is empty', () => {
      expect(useBuildingModel().allBuildings.value).toEqual([])
    })

    it('selectedRoomId is null', () => {
      expect(useBuildingModel().selectedRoomId.value).toBeNull()
    })

    it('selectedFloor is null', () => {
      expect(useBuildingModel().selectedFloor.value).toBeNull()
    })

    it('isExploded is false', () => {
      expect(useBuildingModel().isExploded.value).toBe(false)
    })

    it('explodedRoomId is null', () => {
      expect(useBuildingModel().explodedRoomId.value).toBeNull()
    })
  })

  describe('availableBuildingsNames', () => {
    it('returns an empty array when allBuildings is empty', () => {
      const { availableBuildingsNames } = useBuildingModel()
      expect(availableBuildingsNames.value).toEqual([])
    })

    it('returns id-name-domains tuples for all buildings', () => {
      const { allBuildings, availableBuildingsNames } = useBuildingModel()
      allBuildings.value = [makeBuilding('hq'), makeBuilding('annex')]

      expect(availableBuildingsNames.value).toEqual([
        { id: 'hq', name: 'hq', domains: ['test-domain'] },
        { id: 'annex', name: 'annex', domains: ['test-domain'] },
      ])
    })

    it('updates reactively when allBuildings changes', () => {
      const { allBuildings, availableBuildingsNames } = useBuildingModel()

      allBuildings.value = [makeBuilding('hq')]
      expect(availableBuildingsNames.value).toEqual([
        { id: 'hq', name: 'hq', domains: ['test-domain'] },
      ])

      allBuildings.value = [makeBuilding('hq'), makeBuilding('annex')]
      expect(availableBuildingsNames.value).toEqual([
        { id: 'hq', name: 'hq', domains: ['test-domain'] },
        { id: 'annex', name: 'annex', domains: ['test-domain'] },
      ])
    })
  })

  describe('visibleRooms — no building', () => {
    it('returns an empty array when building is null', () => {
      const { visibleRooms } = useBuildingModel()
      expect(visibleRooms.value).toEqual([])
    })
  })

  describe('visibleRooms — no filters active', () => {
    it('returns all rooms when selectedFloor is null and isExploded is false', () => {
      const rooms = [makeRoom('r1', 0, 0, 0), makeRoom('r2', 0, 1, 0)]
      const { building, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', rooms)

      expect(visibleRooms.value).toEqual(rooms)
    })
  })

  describe('visibleRooms — floor filter', () => {
    it('returns only rooms on the selected floor', () => {
      const r0 = makeRoom('ground', 0, 0, 0)
      const r1 = makeRoom('first', 0, 1, 0)
      const r2 = makeRoom('also-first', 5, 1, 0)
      const { building, selectedFloor, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [r0, r1, r2])
      selectedFloor.value = 1

      expect(visibleRooms.value).toEqual([r1, r2])
    })

    it('returns an empty array when no rooms are on the selected floor', () => {
      const { building, selectedFloor, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [makeRoom('r1', 0, 0, 0)])
      selectedFloor.value = 99

      expect(visibleRooms.value).toEqual([])
    })

    it('returns all rooms when selectedFloor is reset to null', () => {
      const rooms = [makeRoom('r0', 0, 0, 0), makeRoom('r1', 0, 1, 0)]
      const { building, selectedFloor, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', rooms)

      selectedFloor.value = 0
      expect(visibleRooms.value).toHaveLength(1)

      selectedFloor.value = null
      expect(visibleRooms.value).toHaveLength(2)
    })
  })

  describe('visibleRooms — explode filter', () => {
    it('does not filter when isExploded is false', () => {
      const rooms = [makeRoom('r1', 0, 0, 0), makeRoom('r2', 10, 10, 10)]
      const { building, isExploded, explodedRoomId, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', rooms)
      explodedRoomId.value = 'r1'
      isExploded.value = false

      expect(visibleRooms.value).toEqual(rooms)
    })

    it('does not filter when explodedRoomId is null', () => {
      const rooms = [makeRoom('r1', 0, 0, 0), makeRoom('r2', 10, 10, 10)]
      const { building, isExploded, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', rooms)
      isExploded.value = true

      expect(visibleRooms.value).toEqual(rooms)
    })

    it('keeps rooms fully contained within the target bounding box', () => {
      const target = makeRoom('target', 0, 0, 0, 10, 10, 10)
      const inside = makeRoom('inside', 2, 2, 2, 3, 3, 3)
      const outside = makeRoom('outside', -1, 0, 0, 3, 3, 3)

      const { building, isExploded, explodedRoomId, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [target, inside, outside])
      isExploded.value = true
      explodedRoomId.value = 'target'

      expect(visibleRooms.value).toContainEqual(target)
      expect(visibleRooms.value).toContainEqual(inside)
      expect(visibleRooms.value).not.toContainEqual(outside)
    })

    it('excludes a room that overflows the target bounding box', () => {
      const target = makeRoom('target', 0, 0, 0, 10, 10, 10)
      const overflow = makeRoom('overflow', 8, 0, 0, 5, 3, 3)

      const { building, isExploded, explodedRoomId, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [target, overflow])
      isExploded.value = true
      explodedRoomId.value = 'target'

      expect(visibleRooms.value).not.toContain(overflow)
    })

    it('skips the bounding-box filter when explodedRoomId does not match any room', () => {
      const r1 = makeRoom('r1', 0, 0, 0)
      const { building, isExploded, explodedRoomId, visibleRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [r1])
      isExploded.value = true
      explodedRoomId.value = 'ghost'

      expect(visibleRooms.value).toContainEqual(r1)
    })
  })

  describe('visibleRooms — floor and explode combined', () => {
    it('applies floor filter then explode filter sequentially', () => {
      const target = makeRoom('target', 0, 0, 0, 10, 10, 10)
      const inBoxSameFloor = makeRoom('in-box-floor-0', 1, 0, 1, 2, 2, 2)
      const inBoxOtherFloor = makeRoom('in-box-floor-5', 1, 5, 1, 2, 2, 2)

      const { building, selectedFloor, isExploded, explodedRoomId, visibleRooms } =
        useBuildingModel()
      building.value = makeBuilding('hq', [target, inBoxSameFloor, inBoxOtherFloor])
      selectedFloor.value = 0
      isExploded.value = true
      explodedRoomId.value = 'target'

      expect(visibleRooms.value).toContainEqual(target)
      expect(visibleRooms.value).toContainEqual(inBoxSameFloor)
      expect(visibleRooms.value).not.toContainEqual(inBoxOtherFloor)
    })
  })

  describe('displayedBuilding', () => {
    it('returns null when building is null', () => {
      const { displayedBuilding } = useBuildingModel()
      expect(displayedBuilding.value).toBeNull()
    })

    it('returns an object with the same id as the building', () => {
      const { building, displayedBuilding } = useBuildingModel()
      building.value = makeBuilding('hq')

      expect(displayedBuilding.value?.id).toBe('hq')
    })

    it('rooms in displayedBuilding match visibleRooms', () => {
      const r0 = makeRoom('r0', 0, 0, 0)
      const r1 = makeRoom('r1', 0, 1, 0)
      const { building, selectedFloor, displayedBuilding } = useBuildingModel()
      building.value = makeBuilding('hq', [r0, r1])
      selectedFloor.value = 0

      expect(displayedBuilding.value?.rooms).toEqual([r0])
    })

    it('is a spread copy — does not mutate the original building ref', () => {
      const { building, displayedBuilding } = useBuildingModel()
      building.value = makeBuilding('hq', [makeRoom('r1', 0, 0, 0)])

      expect(displayedBuilding.value).not.toBe(building.value)
    })
  })

  describe('watch(building)', () => {
    it('resets selectedRoomId when building changes to a new value', async () => {
      const { building, selectedRoomId } = useBuildingModel()
      selectedRoomId.value = 'some-room'

      building.value = makeBuilding('new-hq')
      await nextTick()

      expect(selectedRoomId.value).toBeNull()
    })

    it('resets selectedFloor when building changes to a new value', async () => {
      const { building, selectedFloor } = useBuildingModel()
      selectedFloor.value = 2

      building.value = makeBuilding('new-hq')
      await nextTick()

      expect(selectedFloor.value).toBeNull()
    })

    it('resets isExploded when building changes to a new value', async () => {
      const { building, isExploded } = useBuildingModel()
      isExploded.value = true

      building.value = makeBuilding('new-hq')
      await nextTick()

      expect(isExploded.value).toBe(false)
    })

    it('resets explodedRoomId when building changes to a new value', async () => {
      const { building, explodedRoomId } = useBuildingModel()
      explodedRoomId.value = 'some-room'

      building.value = makeBuilding('new-hq')
      await nextTick()

      expect(explodedRoomId.value).toBeNull()
    })

    it('does NOT reset state when building is set to null', async () => {
      const { building, selectedRoomId, selectedFloor, isExploded } = useBuildingModel()
      building.value = makeBuilding('hq')
      await nextTick()

      selectedRoomId.value = 'r1'
      selectedFloor.value = 1
      isExploded.value = true

      building.value = null
      await nextTick()

      expect(selectedRoomId.value).toBe('r1')
      expect(selectedFloor.value).toBe(1)
      expect(isExploded.value).toBe(true)
    })
  })

  describe('applySavedRooms', () => {
    it('replaces the live building rooms so the scene reflects a save without a reload', () => {
      const { building, visibleRooms, applySavedRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [makeRoom('r1', 0, 0, 0)])

      const savedRooms = [makeRoom('r1', 5, 0, 5), makeRoom('r2', 0, 1, 0)]
      applySavedRooms(savedRooms)

      expect(visibleRooms.value).toHaveLength(2)
      expect(visibleRooms.value.find((r) => r.id === 'r1')?.position).toEqual({ x: 5, y: 0, z: 5 })
      expect(visibleRooms.value.find((r) => r.id === 'r2')).toBeDefined()
    })

    it('does not keep a live reference to the passed-in array (defensive copy)', () => {
      const { building, applySavedRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [makeRoom('r1', 0, 0, 0)])

      const savedRooms = [makeRoom('r1', 5, 0, 5)]
      applySavedRooms(savedRooms)
      savedRooms[0]!.position.x = 999

      expect(building.value?.rooms[0]?.position.x).toBe(5)
    })

    it('does not reset selectedFloor (the update is in place, not a new building ref)', async () => {
      const { building, selectedFloor, applySavedRooms } = useBuildingModel()
      building.value = makeBuilding('hq', [makeRoom('r1', 0, 1, 0)])
      await nextTick()
      selectedFloor.value = 1

      applySavedRooms([makeRoom('r1', 5, 1, 5)])
      await nextTick()

      expect(selectedFloor.value).toBe(1)
    })

    it('also updates the matching allBuildings entry so re-selecting the building shows the save', () => {
      const { building, allBuildings, applySavedRooms } = useBuildingModel()
      const hq = makeBuilding('hq', [makeRoom('r1', 0, 0, 0)])
      allBuildings.value = [hq]
      building.value = hq

      applySavedRooms([makeRoom('r1', 5, 0, 5), makeRoom('r2', 0, 0, 0)])

      expect(allBuildings.value.find((b) => b.id === 'hq')?.rooms).toHaveLength(2)
    })

    it('is a no-op when there is no active building', () => {
      const { applySavedRooms, visibleRooms } = useBuildingModel()
      expect(() => applySavedRooms([makeRoom('r1', 0, 0, 0)])).not.toThrow()
      expect(visibleRooms.value).toEqual([])
    })
  })

  describe('fetchBuildings', () => {
    it('calls domainsStore.fetchMemberships()', async () => {
      await useBuildingModel().fetchBuildings()

      expect(mockFetchMemberships).toHaveBeenCalledOnce()
    })

    it('calls buildingsStore.fetch() with the memberships', async () => {
      await useBuildingModel().fetchBuildings()

      expect(mockFetchBuildings).toHaveBeenCalledWith(domainStoreMock.memberships)
    })

    it('populates allBuildings from buildingsStore.all', async () => {
      const buildings = [makeBuilding('hq')]
      buildingsStoreMock.all = buildings

      const { fetchBuildings, allBuildings } = useBuildingModel()
      await fetchBuildings()

      expect(allBuildings.value).toEqual([{ ...buildings[0], maxTemperature: 27 }])
    })

    it('hydrates room maxTemperature values from sensor thresholds', async () => {
      const buildings = [
        makeBuilding('hq', [makeRoom('room-1', 0, 0, 0), makeRoom('room-2', 1, 0, 0)]),
      ]
      buildingsStoreMock.all = buildings
      vi.mocked(makeRequest).mockResolvedValue(
        makeThresholdResponse({
          buildingId: 'hq',
          maxTemperature: 30,
          rooms: [{ id: 'room-1', maxTemperature: 32 }],
        }),
      )

      const { fetchBuildings, allBuildings } = useBuildingModel()
      await fetchBuildings()

      expect(allBuildings.value[0]?.maxTemperature).toBe(30)
      expect(allBuildings.value[0]?.rooms.find((r) => r.id === 'room-1')?.maxTemperature).toBe(32)
      expect(allBuildings.value[0]?.rooms.find((r) => r.id === 'room-2')?.maxTemperature).toBe(30)
    })

    it('defaults maxTemperature when threshold endpoint is unavailable', async () => {
      const buildings = [makeBuilding('hq', [makeRoom('room-1', 0, 0, 0)])]
      buildingsStoreMock.all = buildings
      vi.mocked(makeRequest).mockResolvedValue({ ok: false } as Response)

      const { fetchBuildings, allBuildings } = useBuildingModel()
      await fetchBuildings()

      expect(allBuildings.value[0]?.maxTemperature).toBe(27)
      expect(allBuildings.value[0]?.rooms[0]?.maxTemperature).toBe(27)
    })

    it('auto-selects the first building when building is null', async () => {
      const buildings = [makeBuilding('hq'), makeBuilding('annex')]
      buildingsStoreMock.all = buildings

      const { fetchBuildings, building } = useBuildingModel()
      await fetchBuildings()

      expect(building.value).toEqual({ ...buildings[0], maxTemperature: 27 })
    })

    it('does not overwrite an already selected building', async () => {
      const hq = makeBuilding('hq')
      const annex = makeBuilding('annex')
      buildingsStoreMock.all = [hq, annex]

      const { fetchBuildings, building } = useBuildingModel()
      building.value = annex

      await fetchBuildings()

      expect(building.value).toEqual(annex)
    })

    it('does not set building when the fetched list is empty', async () => {
      buildingsStoreMock.all = []

      const { fetchBuildings, building } = useBuildingModel()
      await fetchBuildings()

      expect(building.value).toBeNull()
    })

    it('returns early when memberships is null after fetchMemberships', async () => {
      domainStoreMock = makeDomainStoreMock({ memberships: null })
      vi.mocked(useDomainsStore).mockReturnValue(
        domainStoreMock as unknown as ReturnType<typeof useDomainsStore>,
      )

      await useBuildingModel().fetchBuildings()

      expect(mockFetchBuildings).not.toHaveBeenCalled()
    })

    it('swallows errors and does not throw', async () => {
      mockFetchMemberships.mockRejectedValue(new Error('Network error'))

      await expect(useBuildingModel().fetchBuildings()).resolves.toBeUndefined()
    })

    it('logs the error to the console when fetchMemberships throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchMemberships.mockRejectedValue(new Error('Network error'))

      await useBuildingModel().fetchBuildings()

      expect(consoleSpy).toHaveBeenCalledWith('Error fetching building schema:', expect.any(Error))
    })
  })

  describe('setBuildingById', () => {
    it('sets building to the item with the matching id', () => {
      const hq = makeBuilding('hq')
      const annex = makeBuilding('annex')
      const { allBuildings, building, setBuildingById } = useBuildingModel()
      allBuildings.value = [hq, annex]

      setBuildingById('annex')

      expect(building.value).toEqual(annex)
    })

    it('sets building to null when no building matches the id', () => {
      const { allBuildings, building, setBuildingById } = useBuildingModel()
      allBuildings.value = [makeBuilding('hq')]

      setBuildingById('missing')

      expect(building.value).toBeNull()
    })

    it('sets building to null when allBuildings is empty', () => {
      const { building, setBuildingById } = useBuildingModel()
      setBuildingById('hq')

      expect(building.value).toBeNull()
    })
  })

  describe('toggleRoom', () => {
    it('selects a room when none is selected', () => {
      const { selectedRoomId, toggleRoom } = useBuildingModel()
      toggleRoom('room-1')

      expect(selectedRoomId.value).toBe('room-1')
    })

    it('deselects the room when the same id is toggled again', () => {
      const { selectedRoomId, toggleRoom } = useBuildingModel()
      toggleRoom('room-1')
      toggleRoom('room-1')

      expect(selectedRoomId.value).toBeNull()
    })

    it('switches to a different room when a new id is toggled', () => {
      const { selectedRoomId, toggleRoom } = useBuildingModel()
      toggleRoom('room-1')
      toggleRoom('room-2')

      expect(selectedRoomId.value).toBe('room-2')
    })
  })

  describe('setFloor', () => {
    it('sets selectedFloor to the given floor number', () => {
      const { selectedFloor, setFloor } = useBuildingModel()
      setFloor(3)

      expect(selectedFloor.value).toBe(3)
    })

    it('accepts null to clear the floor filter', () => {
      const { selectedFloor, setFloor } = useBuildingModel()
      setFloor(2)
      setFloor(null)

      expect(selectedFloor.value).toBeNull()
    })

    it('resets selectedRoomId when the floor changes', () => {
      const { selectedRoomId, setFloor } = useBuildingModel()
      selectedRoomId.value = 'room-1'

      setFloor(2)

      expect(selectedRoomId.value).toBeNull()
    })

    it('resets selectedRoomId even when floor is set to null', () => {
      const { selectedRoomId, setFloor } = useBuildingModel()
      selectedRoomId.value = 'room-1'

      setFloor(null)

      expect(selectedRoomId.value).toBeNull()
    })
  })
})
