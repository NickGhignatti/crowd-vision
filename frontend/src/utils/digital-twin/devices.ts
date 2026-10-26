/** One device twin placed this tick; nothing on it follows a phone to the next tick. */
export interface Device {
  floor: number
  room: string
  x: number
  y: number
  z: number
  /** One spread of the position, in metres along each axis. */
  radius: number
  /** False for someone passing who never joined the Wi-Fi. */
  connected: boolean
}

/** One building's devices from one Wi-Fi tick, as the `devices` socket event carries them. */
export interface Devices {
  buildingId: string
  tick: number
  devices: Device[]
}

/** Twin sends nothing for a quiet collector, so past this age the dots are no longer live. */
export const STALE_AFTER_MS = 30_000

const KEYS = ['buildingId', 'tick', 'devices']
const DEVICE_KEYS = ['floor', 'room', 'x', 'y', 'z', 'radius', 'connected']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const exactly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key)) && keys.every((key) => key in body)

function parseDevice(body: unknown): Device {
  // An extra key could be an id, and an id would follow one phone through the building.
  if (!isRecord(body) || !exactly(body, DEVICE_KEYS)) {
    throw new Error(`a device must carry exactly ${DEVICE_KEYS.join(', ')}`)
  }
  const { floor, room, x, y, z, radius, connected } = body
  if (!isIndex(floor)) throw new Error('floor must be a non-negative integer')
  if (typeof room !== 'string' || room === '') throw new Error('room must be a non-empty string')
  if (!isNumber(x) || !isNumber(y) || !isNumber(z) || !isNumber(radius)) {
    throw new Error('x, y, z and radius must be numbers')
  }
  if (typeof connected !== 'boolean') throw new Error('connected must be a boolean')
  return { floor, room, x, y, z, radius, connected }
}

/** Reads a `devices` event, throwing on any other shape. */
export function parseDevices(body: unknown): Devices {
  if (!isRecord(body) || !exactly(body, KEYS)) {
    throw new Error(`devices must carry exactly ${KEYS.join(', ')}`)
  }
  const { buildingId, tick, devices } = body
  if (typeof buildingId !== 'string' || buildingId === '') {
    throw new Error('buildingId must be a non-empty string')
  }
  if (!isIndex(tick)) throw new Error('tick must be a non-negative integer')
  if (!Array.isArray(devices)) throw new Error('devices must be a list')
  return { buildingId, tick, devices: devices.map(parseDevice) }
}

export const isStale = (devices: Devices, nowMs: number): boolean =>
  nowMs - devices.tick > STALE_AFTER_MS

/** The devices standing in a room on screen, so a hidden floor shows none. */
export function visibleDevices(devices: Device[], rooms: { id: string }[]): Device[] {
  const shown = new Set(rooms.map(({ id }) => id))
  return devices.filter(({ room }) => shown.has(room))
}

export function splitDevices(devices: Device[]): { connected: Device[]; passing: Device[] } {
  return {
    connected: devices.filter(({ connected }) => connected),
    passing: devices.filter(({ connected }) => !connected),
  }
}

/** Instances to reserve for `count` dots: a power of two, at least 64. */
export function dotCapacity(count: number): number {
  let capacity = 64
  while (capacity < count) capacity *= 2
  return capacity
}
