import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { useBuildingSensors } from '../useSensorData'
import { makeRequest } from '@/composables/core/useApi.ts'

vi.mock('@/composables/core/useApi', () => ({ makeRequest: vi.fn() }))

const makeResponse = (ok = true, data: unknown[] = []) => ({
  ok,
  json: vi.fn().mockResolvedValue({ data }),
})

describe('useRoomSensors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads sensors for the selected room', async () => {
    vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, [{ sensorId: 's-1' }]) as never)

    const { sensors, refresh } = useBuildingSensors(ref('bldg-1'))
    await refresh()

    expect(makeRequest).toHaveBeenCalledWith('/sensor/sensors/buildings/bldg-1')
    expect(sensors.value).toEqual([{ sensorId: 's-1' }])
  })

  it('auto-loads sensors when a building id is available', async () => {
    vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, [{ sensorId: 's-1' }]) as never)

    const { sensors } = useBuildingSensors(ref('bldg-1'))

    await flushPromises()
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith('/sensor/sensors/buildings/bldg-1')
    expect(sensors.value).toEqual([{ sensorId: 's-1' }])
  })

  it('registers a sensor and refreshes the room list', async () => {
    vi.mocked(makeRequest)
      .mockResolvedValueOnce(makeResponse(true, [{ sensorId: 's-1' }]) as never)
      .mockResolvedValueOnce(makeResponse(true) as never)
      .mockResolvedValueOnce(makeResponse(true, [{ sensorId: 's-1' }, { sensorId: 's-2' }]) as never)

    const { registerSensor, sensors } = useBuildingSensors(ref('bldg-1'))
    await flushPromises()
    await registerSensor({ roomId: 'room-1', sensorId: 's-2', sensorType: 'temperature' })
    await flushPromises()

    expect(makeRequest).toHaveBeenCalledWith('/sensor/sensor', 'POST', expect.any(Object))
    expect(sensors.value).toEqual([{ sensorId: 's-1' }, { sensorId: 's-2' }])
  })
})