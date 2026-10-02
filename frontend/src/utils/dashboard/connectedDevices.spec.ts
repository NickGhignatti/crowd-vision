import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STALE_AFTER_MS, isStale, parseConnectedDevices } from './connectedDevices.ts'

// Telemetry sums a building's devices in Rust; the fixture is the only thing holding this
// reader to the same shape.
const fixture = join(__dirname, '../../../../schemas/fixtures/connected-devices.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  cases: { name: string; body: unknown }[]
  rejected: { name: string; reason: string; body: unknown }[]
}

describe("a building's connected devices, as telemetry sums them", () => {
  it.each(wire.cases)('reads $name', ({ body }) => {
    expect(parseConnectedDevices(body)).toEqual(body)
  })

  it.each(wire.rejected)('refuses $name', ({ body }) => {
    expect(() => parseConnectedDevices(body)).toThrow()
  })
})

describe('whether the figure is still live', () => {
  const devices = { buildingId: 'b1', totalDeviceCount: 3, timestamp: 1_000_000 }

  it('is live up to the cutoff and stale one millisecond after', () => {
    expect(isStale(devices, 1_000_000 + STALE_AFTER_MS)).toBe(false)
    expect(isStale(devices, 1_000_001 + STALE_AFTER_MS)).toBe(true)
  })
})
