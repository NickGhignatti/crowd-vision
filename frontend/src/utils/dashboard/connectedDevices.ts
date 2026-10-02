/** A building's connected devices at its newest report, summed by telemetry. */
export interface ConnectedDevices {
  buildingId: string
  totalDeviceCount: number
  timestamp: number
}

/** Past this age the collector has stopped reporting, so the figure is no longer live. */
export const STALE_AFTER_MS = 5 * 60_000

const KEYS = ['buildingId', 'totalDeviceCount', 'timestamp']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Reads telemetry's answer, throwing on any other shape. */
export function parseConnectedDevices(body: unknown): ConnectedDevices {
  if (!isRecord(body) || Object.keys(body).some((key) => !KEYS.includes(key))) {
    throw new Error(`connected devices must carry exactly ${KEYS.join(', ')}`)
  }
  const { buildingId, totalDeviceCount, timestamp } = body
  if (typeof buildingId !== 'string' || buildingId === '') {
    throw new Error('buildingId must be a non-empty string')
  }
  if (!isCount(totalDeviceCount) || !isCount(timestamp)) {
    throw new Error('totalDeviceCount and timestamp must be non-negative integers')
  }
  return { buildingId, totalDeviceCount, timestamp }
}

export const isStale = (devices: ConnectedDevices, nowMs: number): boolean =>
  nowMs - devices.timestamp > STALE_AFTER_MS
