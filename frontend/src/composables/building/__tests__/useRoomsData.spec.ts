import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useBuildingTemperature, useBuildingAirQualitySensors } from '../useRoomsData'
import { useBuildingSensor } from '../useBuildingSensor'
import type { ApiDataPoint } from '../useSensorData'

/**
 * Tests for useRoomsData.ts composables.
 *
 * Both exported functions delegate data fetching to `useBuildingSensor`
 * (the shared sensor-data store).  We mock that dependency so we can control
 * the reactive `data` ref directly and test only the aggregation logic.
 *
 * Key behaviours under test:
 *  – `useBuildingTemperature` averages temperature readings per roomId.
 *  – `useBuildingAirQualitySensors` extracts per-room IAQI, honouring both
 *    the legacy `indoorAqi` field and the newer `indoor_aqi` field.
 */

vi.mock('../useBuildingSensor', () => ({
  useBuildingSensor: vi.fn(),
}))

const makeDataRef = (points: Partial<ApiDataPoint>[]) =>
  ref(points as ApiDataPoint[])

const defaultMock = (points: Partial<ApiDataPoint>[] = []) => {
  vi.mocked(useBuildingSensor).mockReturnValue({
    data: makeDataRef(points),
    isLoading: ref(false),
    error: ref(null),
  })
}

describe('useBuildingTemperature', () => {
  beforeEach(() => {
    defaultMock()
  })

  it('returns an empty averages map when there is no sensor data', () => {
    const buildingId = ref<string | undefined>('bldg-1')
    const { temperatures } = useBuildingTemperature(buildingId)
    expect(temperatures.value).toEqual({})
  })

  it('returns the raw value for a room with a single reading', () => {
    defaultMock([{ roomId: 'r1', value: 22, timestamp: '1', building: 'b' }])
    const { temperatures } = useBuildingTemperature(ref('bldg-1'))
    expect(temperatures.value).toEqual({ r1: 22 })
  })

  it('averages multiple readings for the same room', () => {
    defaultMock([
      { roomId: 'r1', value: 20, timestamp: '1', building: 'b' },
      { roomId: 'r1', value: 22, timestamp: '2', building: 'b' },
    ])
    const { temperatures } = useBuildingTemperature(ref('bldg-1'))
    expect(temperatures.value['r1']).toBe(21) // (20 + 22) / 2
  })

  it('groups readings independently per room', () => {
    defaultMock([
      { roomId: 'r1', value: 20, timestamp: '1', building: 'b' },
      { roomId: 'r1', value: 22, timestamp: '2', building: 'b' },
      { roomId: 'r2', value: 18, timestamp: '3', building: 'b' },
    ])
    const { temperatures } = useBuildingTemperature(ref('bldg-1'))
    expect(temperatures.value['r1']).toBe(21)
    expect(temperatures.value['r2']).toBe(18)
  })

  it('skips data points that have no value field', () => {
    defaultMock([
      { roomId: 'r1', value: 20, timestamp: '1', building: 'b' },
      { roomId: 'r1', timestamp: '2', building: 'b' }, // no value
    ])
    const { temperatures } = useBuildingTemperature(ref('bldg-1'))
    // Only the first point should be counted
    expect(temperatures.value['r1']).toBe(20)
  })

  it('handles fractional averages correctly', () => {
    defaultMock([
      { roomId: 'r1', value: 21, timestamp: '1', building: 'b' },
      { roomId: 'r1', value: 22, timestamp: '2', building: 'b' },
      { roomId: 'r1', value: 23, timestamp: '3', building: 'b' },
    ])
    const { temperatures } = useBuildingTemperature(ref('bldg-1'))
    // (21 + 22 + 23) / 3 = 22
    expect(temperatures.value['r1']).toBeCloseTo(22)
  })

  it('also returns isLoading and error refs from the underlying fetch', () => {
    const { isLoading, error } = useBuildingTemperature(ref('bldg-1'))
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
  })
})

describe('useBuildingAirQualitySensors', () => {
  beforeEach(() => {
    defaultMock()
  })

  it('returns an empty map when there is no sensor data', () => {
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value).toEqual({})
  })

  it('reads the indoor_aqi field (new naming convention)', () => {
    defaultMock([{ roomId: 'r1', indoor_aqi: 45, timestamp: '1', building: 'b' }])
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value['r1']).toBe(45)
  })

  it('reads the indoorAqi field (legacy naming convention)', () => {
    defaultMock([{ roomId: 'r2', indoorAqi: 60, timestamp: '1', building: 'b' }])
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value['r2']).toBe(60)
  })

  it('prefers indoor_aqi over indoorAqi when both are present', () => {
    defaultMock([
      { roomId: 'r1', indoor_aqi: 40, indoorAqi: 99, timestamp: '1', building: 'b' },
    ])
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    // indoor_aqi ?? indoorAqi → 40 wins
    expect(indoorAqi.value['r1']).toBe(40)
  })

  it('excludes rooms with no IAQI field at all', () => {
    defaultMock([{ roomId: 'r1', timestamp: '1', building: 'b' }]) // no iaqi
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value).not.toHaveProperty('r1')
  })

  it('handles a mix of rooms with and without IAQI data', () => {
    defaultMock([
      { roomId: 'r1', indoor_aqi: 45, timestamp: '1', building: 'b' },
      { roomId: 'r2', indoorAqi: 60, timestamp: '2', building: 'b' }, // legacy
      { roomId: 'r3', timestamp: '3', building: 'b' }, // missing
    ])
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value['r1']).toBe(45)
    expect(indoorAqi.value['r2']).toBe(60)
    expect(indoorAqi.value).not.toHaveProperty('r3')
  })

  it('overwrites with the last reading when a room appears multiple times', () => {
    // The composable performs a last-write-wins assignment, not averaging
    defaultMock([
      { roomId: 'r1', indoor_aqi: 45, timestamp: '1', building: 'b' },
      { roomId: 'r1', indoor_aqi: 80, timestamp: '2', building: 'b' },
    ])
    const { indoorAqi } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(indoorAqi.value['r1']).toBe(80)
  })

  it('also returns isLoading and error refs from the underlying fetch', () => {
    const { isLoading, error } = useBuildingAirQualitySensors(ref('bldg-1'))
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
  })
})
