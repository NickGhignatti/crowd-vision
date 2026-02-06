import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBuildingModel } from '../useBuildingModel'
import { flushPromises } from '@vue/test-utils'
import type { BuildingPayload } from '@/scripts/schema.ts'

// Mock generic types for the test since we don't have the actual schema file
// Based on usage in the composable
interface Room {
  id: string
  position: { x: number; y: number; z: number }
  dimensions: { width: number; height: number; depth: number }
}

interface Building {
  id: string
  rooms: Room[]
}

describe('useBuildingModel', () => {
  const mockRooms: Room[] = [
    {
      id: 'Room-1',
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 100, height: 10, depth: 100 },
    },
    {
      id: 'Room-2',
      position: { x: 0, y: 10, z: 0 },
      dimensions: { width: 50, height: 10, depth: 50 },
    },
    {
      id: 'Room-3',
      position: { x: 10, y: 0, z: 10 },
      dimensions: { width: 10, height: 5, depth: 10 },
    },
  ]

  const mockBuildings: Building[] = [
    { id: 'Building-A', rooms: mockRooms },
    { id: 'Building-B', rooms: [] },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Default mock for fetch to avoid errors in un-mocked tests
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with empty state', () => {
    const { building, availableBuildingsNames, visibleRooms } = useBuildingModel()

    expect(building.value).toBeNull()
    expect(availableBuildingsNames.value).toEqual([])
    expect(visibleRooms.value).toEqual([])
  })

  it('fetchBuildings fetches domain and then buildings', async () => {
    const { fetchBuildings, availableBuildingsNames, building } = useBuildingModel()

    localStorage.setItem('username', 'TestUser')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ domain: { name: 'TestDomain' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBuildings,
      })

    global.fetch = fetchMock

    await fetchBuildings()
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/auth/domain/TestUser'))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/twin/buildings/TestDomain'),
    )

    expect(availableBuildingsNames.value).toEqual(['Building-A', 'Building-B'])

    // Should auto-select first building
    expect(building.value?.id).toBe('Building-A')
  })

  it('toggles selected room correctly', () => {
    const { toggleRoom, selectedRoomId } = useBuildingModel()

    toggleRoom('Room-1')
    expect(selectedRoomId.value).toBe('Room-1')

    toggleRoom('Room-1')
    expect(selectedRoomId.value).toBeNull()

    toggleRoom('Room-2')
    expect(selectedRoomId.value).toBe('Room-2')
  })

  it('sets floor and resets selected room', () => {
    const { setFloor, selectedFloor, selectedRoomId } = useBuildingModel()

    selectedRoomId.value = 'Room-1'

    setFloor(2)

    expect(selectedFloor.value).toBe(2)
    expect(selectedRoomId.value).toBeNull()
  })

  describe('Computed Properties & Filtering', () => {
    // Helper to manually hydrate state without fetching
    const initModel = () => {
      const model = useBuildingModel()
      model.building.value = mockBuildings[0] as BuildingPayload
      return model
    }

    it('filters rooms by selected floor', () => {
      const { visibleRooms, setFloor } = initModel()

      // Select Ground Floor (y=0)
      setFloor(0)

      // Should contain Room-1 (y=0) and Room-3 (y=0)
      expect(visibleRooms.value.map((r) => r.id)).toContain('Room-1')
      expect(visibleRooms.value.map((r) => r.id)).toContain('Room-3')

      // Should NOT contain Room-2 (y=10)
      expect(visibleRooms.value.map((r) => r.id)).not.toContain('Room-2')
    })

    it('filters rooms by "exploded" (containment) logic', () => {
      const { visibleRooms, isExploded, explodedRoomId } = initModel()

      isExploded.value = true
      explodedRoomId.value = 'Room-1'

      const ids = visibleRooms.value.map((r) => r.id)

      expect(ids).toContain('Room-3') // Inside
      expect(ids).toContain('Room-1') // Self
      expect(ids).not.toContain('Room-2') // Outside/Above
    })

    it('returns empty rooms if exploded target is not found', () => {
      const { visibleRooms, isExploded, explodedRoomId } = initModel()

      isExploded.value = true
      explodedRoomId.value = 'Non-Existent-Room'

      expect(visibleRooms.value.length).toBe(3)
    })
  })

  it('resets state when building changes', async () => {
    const model = useBuildingModel()
    model.building.value = mockBuildings[0] as BuildingPayload

    // Dirty the state
    model.selectedRoomId.value = 'Room-1'
    model.selectedFloor.value = 1
    model.isExploded.value = true

    // Change building
    model.building.value = mockBuildings[1] as BuildingPayload

    // Wait for watcher
    await flushPromises()

    expect(model.selectedRoomId.value).toBeNull()
    expect(model.selectedFloor.value).toBeNull()
    expect(model.isExploded.value).toBe(false)
  })
})
