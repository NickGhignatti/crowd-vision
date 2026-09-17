import { describe, expect, it } from 'vitest'
import type { Room } from '@/types/digital-twin/building.ts'
import { COMFORT_GLOW, temperatureDeviation, thermalGlows } from './thermalGlow.ts'

const room = (id: string, maxTemperature?: number): Room => ({
  id,
  name: id,
  capacity: 10,
  maxTemperature,
  position: { x: 0, y: 1.5, z: 0 },
  dimensions: { width: 4, height: 3, depth: 4 },
})

describe('how far a reading drifts from comfort', () => {
  it.each([19, 21, 23])('is nothing at %s °C, inside the comfort window of a 27 °C room', (t) => {
    expect(temperatureDeviation(t, 27)).toBe(0)
  })

  it('grows toward the limit and is full at it', () => {
    expect(temperatureDeviation(25, 27)).toBeCloseTo(0.5)
    expect(temperatureDeviation(27, 27)).toBe(1)
    expect(temperatureDeviation(35, 27)).toBe(1)
  })

  it('grows on the cold side too, full 12 °C below the limit', () => {
    expect(temperatureDeviation(17, 27)).toBeCloseTo(0.5)
    expect(temperatureDeviation(10, 27)).toBe(1)
  })

  it('follows each room limit', () => {
    expect(temperatureDeviation(33, 35)).toBe(temperatureDeviation(25, 27))
  })
})

describe('the rooms that glow', () => {
  const rooms = [room('hot'), room('fine'), room('silent'), room('unread'), room('server', 35)]
  const readings = { hot: 26, fine: 21, silent: 0, server: 30 }
  const glows = thermalGlows(rooms, readings)

  it('are every room with a reading, so an absent sensor paints nothing', () => {
    expect(glows.map((glow) => glow.room.id)).toEqual(['hot', 'fine', 'server'])
  })

  it('keeps comfortable rooms gentle, relative to each room limit', () => {
    expect(glows[1]!.strength).toBe(COMFORT_GLOW)
    expect(glows[2]!.strength).toBe(COMFORT_GLOW)
  })

  it('strengthens with the drift, so problems still stand out', () => {
    expect(glows[0]!.strength).toBeCloseTo(COMFORT_GLOW + (1 - COMFORT_GLOW) * 0.75)
  })
})
