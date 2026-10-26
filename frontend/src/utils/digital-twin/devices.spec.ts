import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STALE_AFTER_MS,
  dotCapacity,
  isStale,
  parseDevices,
  splitDevices,
  visibleDevices,
} from './devices.ts'
import type { Device } from './devices.ts'

// Twin builds this tick in Rust and socket relays it unread; the fixture holds this reader to it.
const fixture = join(__dirname, '../../../../schemas/fixtures/devices.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  cases: { name: string; body: unknown }[]
  rejected: { name: string; reason: string; body: unknown }[]
}

describe("a building's devices, as twin places them", () => {
  it.each(wire.cases)('reads $name', ({ body }) => {
    expect(parseDevices(body)).toEqual(body)
  })

  it.each(wire.rejected)('refuses $name', ({ body }) => {
    expect(() => parseDevices(body)).toThrow()
  })
})

const device = (room: string, connected = true): Device => ({
  floor: 0,
  room,
  x: 1,
  y: 0,
  z: 2,
  radius: 1.5,
  connected,
})

describe('whether a tick is still live', () => {
  const tick = { buildingId: 'b1', tick: 1_000_000, devices: [] }

  it('is live up to the cutoff and stale one millisecond after', () => {
    expect(isStale(tick, 1_000_000 + STALE_AFTER_MS)).toBe(false)
    expect(isStale(tick, 1_000_001 + STALE_AFTER_MS)).toBe(true)
  })
})

describe('visibleDevices', () => {
  it('keeps only the devices standing in a room on screen', () => {
    const devices = [device('a'), device('b'), device('c')]
    expect(visibleDevices(devices, [{ id: 'a' }, { id: 'c' }])).toEqual([devices[0], devices[2]])
  })
})

describe('splitDevices', () => {
  it('separates phones on the Wi-Fi from people passing by', () => {
    const on = device('a')
    const passing = device('b', false)
    expect(splitDevices([on, passing])).toEqual({ connected: [on], passing: [passing] })
  })
})

describe('dotCapacity', () => {
  it('reserves room for at least 64 dots', () => {
    expect(dotCapacity(0)).toBe(64)
    expect(dotCapacity(64)).toBe(64)
  })

  it('doubles past that, so a growing crowd rarely rebuilds the mesh', () => {
    expect(dotCapacity(65)).toBe(128)
    expect(dotCapacity(300)).toBe(512)
  })
})
