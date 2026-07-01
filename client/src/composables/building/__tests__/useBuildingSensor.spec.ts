import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useBuildingSensor } from '@/composables/building/useBuildingSensor.ts'
import { useSensorDataStore } from '@/stores/sensorData.ts'
import { makeRequest } from '@/composables/core/useApi.ts'

const { socketMock, socketHandlers } = vi.hoisted(() => {
  const socketHandlers: Record<string, (...args: unknown[]) => void> = {}
  const socketMock = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      socketHandlers[event] = cb
    }),
    off: vi.fn(),
    emit: vi.fn(),
  }
  return { socketMock, socketHandlers }
})

vi.mock('@/services/socket', () => ({ socket: socketMock }))
vi.mock('@/composables/core/useApi', () => ({ makeRequest: vi.fn() }))

const makeResponse = (ok: boolean, body: unknown = { data: [] }) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

const fireTelemetry = (event: unknown) => socketHandlers['telemetry']?.(event)
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useBuildingSensor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    for (const k of Object.keys(socketHandlers)) delete socketHandlers[k]
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [] }) as unknown as Response,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('acquires the bucket for the initial building', () => {
    const store = useSensorDataStore()
    const acquire = vi.spyOn(store, 'acquire')

    const { data } = useBuildingSensor(ref('b1'), 'temperature')

    expect(acquire).toHaveBeenCalledWith('b1', 'temperature')
    expect(data.value).toEqual([])
  })

  it('does not acquire and stays empty when the building id is undefined', () => {
    const store = useSensorDataStore()
    const acquire = vi.spyOn(store, 'acquire')

    const { data } = useBuildingSensor(ref<string | undefined>(undefined), 'temperature')

    expect(acquire).not.toHaveBeenCalled()
    expect(data.value).toEqual([])
  })

  it('releases the previous building and acquires the new one on change', async () => {
    const store = useSensorDataStore()
    const acquire = vi.spyOn(store, 'acquire')
    const release = vi.spyOn(store, 'release')
    const id = ref('b1')

    useBuildingSensor(id, 'temperature')
    id.value = 'b2'
    await nextTick()

    expect(release).toHaveBeenCalledWith('b1', 'temperature')
    expect(acquire).toHaveBeenCalledWith('b2', 'temperature')
  })

  it('exposes the bucket data and reflects live telemetry', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [{ roomId: 'r1', value: 1 }] }) as unknown as Response,
    )
    useSensorDataStore()

    const { data } = useBuildingSensor(ref('b1'), 'temperature')
    await flush()
    expect(data.value).toHaveLength(1)

    fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 9 })
    expect(data.value[0]?.value).toBe(9)
  })

  // Regression: the right-hand room menu renders telemetry through a `computed`
  // (enrichedRooms), and the view is a watcher that must be *notified* to re-render.
  // Vue ≥3.4 only re-notifies a computed's dependents when its value changes by
  // identity. An in-place array mutation keeps the same reference, so the
  // notification is swallowed at the computed boundary and the menu freezes on its
  // first reading. A telemetry tick must therefore hand out a new array reference.
  it('notifies a downstream watcher on live telemetry', async () => {
    vi.mocked(makeRequest).mockResolvedValue(
      makeResponse(true, { data: [{ roomId: 'r1', value: 1 }] }) as unknown as Response,
    )
    useSensorDataStore()

    const { data } = useBuildingSensor(ref('b1'), 'temperature')
    await flush()

    // Mirrors RoomsSelector.enrichedRooms: a computed derived from `data`, observed
    // by an effect (the render) that only re-runs when it gets notified.
    const tempForR1 = computed(() => data.value.find((d) => d.roomId === 'r1')?.value)
    const seen: (number | undefined)[] = []
    watch(tempForR1, (v) => seen.push(v))

    fireTelemetry({ type: 'temperature', buildingId: 'b1', roomId: 'r1', value: 9 })
    await nextTick()

    expect(seen).toContain(9)
  })
})
