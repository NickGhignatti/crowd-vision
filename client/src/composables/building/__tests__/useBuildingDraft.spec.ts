import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBuildingDraft } from '../useBuildingDraft'
import { makeRequest } from '@/composables/core/useApi.ts'

vi.mock('@/composables/core/useApi', () => ({ makeRequest: vi.fn() }))
vi.mock('@/stores/buildings', () => ({
  useBuildingsStore: () => ({ register: vi.fn().mockResolvedValue('generated-id-001') }),
}))

const makeResponse = (ok = true) => ({ ok, json: vi.fn().mockResolvedValue({}) })

const rawJson = {
  name: 'Campus A',
  rooms: [
    { id: 'room-1', name: 'Lab', capacity: 25, position: {}, dimensions: {} },
    { id: 'room-2', name: 'Office', capacity: 10, position: {}, dimensions: {} },
  ],
}

describe('useBuildingDraft', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('loadFromJson', () => {
    it('sets hasData to true after loading', () => {
      const { hasData, loadFromJson } = useBuildingDraft()
      expect(hasData.value).toBe(false)
      loadFromJson(rawJson)
      expect(hasData.value).toBe(true)
    })

    it('copies building name from JSON', () => {
      const { draft, loadFromJson } = useBuildingDraft()
      loadFromJson(rawJson)
      expect(draft.value!.name).toBe('Campus A')
    })

    it('trims building name whitespace', () => {
      const { draft, loadFromJson } = useBuildingDraft()
      loadFromJson({ ...rawJson, name: '  Campus A  ' })
      expect(draft.value!.name).toBe('Campus A')
    })

    it('seeds default building thresholds', () => {
      const { draft, loadFromJson } = useBuildingDraft()
      loadFromJson(rawJson)
      expect(draft.value!.thresholds.maxTemp).toBe(27)
      expect(draft.value!.thresholds.minTemp).toBe(18)
      expect(draft.value!.thresholds.maxAqi).toBe(75)
      expect(draft.value!.thresholds.maxCo2).toBe(1000)
    })

    it('maps room capacity to thresholds.maxPeople', () => {
      const { draft, loadFromJson } = useBuildingDraft()
      loadFromJson(rawJson)
      expect(draft.value!.rooms[0]!.thresholds.maxPeople).toBe(25)
      expect(draft.value!.rooms[1]!.thresholds.maxPeople).toBe(10)
    })

    it('creates a room entry for each room in JSON', () => {
      const { draft, loadFromJson } = useBuildingDraft()
      loadFromJson(rawJson)
      expect(draft.value!.rooms).toHaveLength(2)
      expect(draft.value!.rooms[0]!.id).toBe('room-1')
    })
  })

  describe('updateBuilding', () => {
    it('patches building-level fields', () => {
      const { draft, loadFromJson, updateBuilding } = useBuildingDraft()
      loadFromJson(rawJson)
      updateBuilding({ name: 'Renamed Campus' })
      expect(draft.value!.name).toBe('Renamed Campus')
    })

    it('does nothing when draft is null', () => {
      const { updateBuilding } = useBuildingDraft()
      expect(() => updateBuilding({ name: 'X' })).not.toThrow()
    })
  })

  describe('updateRoom', () => {
    it('patches the matching room', () => {
      const { draft, loadFromJson, updateRoom } = useBuildingDraft()
      loadFromJson(rawJson)
      updateRoom('room-1', { name: 'Updated Lab' })
      expect(draft.value!.rooms[0]!.name).toBe('Updated Lab')
    })

    it('leaves other rooms unchanged', () => {
      const { draft, loadFromJson, updateRoom } = useBuildingDraft()
      loadFromJson(rawJson)
      updateRoom('room-1', { name: 'Changed' })
      expect(draft.value!.rooms[1]!.name).toBe('Office')
    })

    it('does nothing when roomId does not match any room', () => {
      const { draft, loadFromJson, updateRoom } = useBuildingDraft()
      loadFromJson(rawJson)
      updateRoom('non-existent', { name: 'Ghost' })
      expect(draft.value!.rooms[0]!.name).toBe('Lab')
    })
  })

  describe('clear', () => {
    it('resets draft to null', () => {
      const { draft, hasData, loadFromJson, clear } = useBuildingDraft()
      loadFromJson(rawJson)
      clear()
      expect(draft.value).toBeNull()
      expect(hasData.value).toBe(false)
    })
  })

  describe('submit', () => {
    it('calls makeRequest for temperature and airQuality threshold patches', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse() as unknown as Response)
      const { loadFromJson, submit } = useBuildingDraft()
      loadFromJson(rawJson)
      await submit('acme')

      const urls = vi.mocked(makeRequest).mock.calls.map((c) => c[0])
      expect(urls).toContain('/sensor/thresholds/temperature/buildings/generated-id-001')
      expect(urls).toContain('/sensor/thresholds/airQuality/buildings/generated-id-001')
    })

    it('patches peopleCount threshold for each room', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse() as unknown as Response)
      const { loadFromJson, submit } = useBuildingDraft()
      loadFromJson(rawJson)
      await submit('acme')

      const urls = vi.mocked(makeRequest).mock.calls.map((c) => c[0])
      expect(urls).toContain(
        '/sensor/thresholds/peopleCount/buildings/generated-id-001/rooms/room-1',
      )
      expect(urls).toContain(
        '/sensor/thresholds/peopleCount/buildings/generated-id-001/rooms/room-2',
      )
    })

    it('sets isSubmitting to false after completion', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse() as unknown as Response)
      const { loadFromJson, submit, isSubmitting } = useBuildingDraft()
      loadFromJson(rawJson)
      await submit('acme')
      expect(isSubmitting.value).toBe(false)
    })

    it('registers all provided sensors', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse() as unknown as Response)
      const { loadFromJson, submit } = useBuildingDraft()
      loadFromJson(rawJson)

      await submit('acme', [
        { roomId: 'room-1', sensorId: 'temp-001', sensorType: 'temperature' },
        { roomId: 'room-2', sensorId: 'temp-002', sensorType: 'temperature' },
      ])

      const sensorCalls = vi
        .mocked(makeRequest)
        .mock.calls.filter((c) => c[0] === '/sensor/sensor' && c[1] === 'POST')

      expect(sensorCalls).toHaveLength(2)
    })

    it('calls executeAction for each provided sensor', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse() as unknown as Response)
      const { loadFromJson, submit } = useBuildingDraft()
      loadFromJson(rawJson)

      await submit('acme', [{ roomId: 'room-1', sensorId: 'temp-001', sensorType: 'temperature' }])

      const actionCalls = vi
        .mocked(makeRequest)
        .mock.calls.filter((c) => c[0] === '/sensor/executeAction' && c[1] === 'POST')

      expect(actionCalls).toHaveLength(1)
    })

    it('does nothing when draft is null', async () => {
      const { submit } = useBuildingDraft()
      await submit('acme')
      expect(makeRequest).not.toHaveBeenCalled()
    })
  })
})
