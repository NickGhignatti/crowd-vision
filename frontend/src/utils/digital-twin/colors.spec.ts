import { describe, expect, it } from 'vitest'
import {
  AQI_BANDS,
  TEMPERATURE_BANDS,
  roomColorByAirQuality,
  TEMPERATURE_SCALE,
  roomColorByTemperature,
  temperatureColor,
  temperatureGradient,
  aqiColor,
  aqiGradient,
} from './colors.ts'

describe('the colour a room takes in temperature mode', () => {
  it.each([
    [15.9, '#1E3A8A'],
    [16, '#0EA5E9'],
    [21, '#10B981'],
    [26.9, '#F59E0B'],
    [30, '#EF4444'],
  ])('%s °C paints %s', (value, color) => {
    expect(roomColorByTemperature(value)).toBe(color)
  })

  it('paints a room with no reading black', () => {
    expect(roomColorByTemperature(0)).toBe('#000000')
  })
})

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

describe('the colour a room takes against its own temperature limit', () => {
  it('is red at or above the limit', () => {
    expect(temperatureColor(27, 27)).toBe('#dc2626')
    expect(temperatureColor(40, 27)).toBe('#dc2626')
  })

  it('is blue far below the limit', () => {
    expect(temperatureColor(10, 27)).toBe('#2563eb')
  })

  it('takes each stop colour exactly at that stop', () => {
    for (const stop of TEMPERATURE_SCALE) {
      expect(temperatureColor(27 + stop.offset, 27)).toBe(stop.color.toLowerCase())
    }
  })

  it('reads the same for any limit, so a server room and an office compare fairly', () => {
    expect(temperatureColor(28, 35)).toBe(temperatureColor(20, 27))
  })

  it('blends between stops instead of jumping', () => {
    const [a, b] = [temperatureColor(21.9, 27), temperatureColor(22, 27)].map(channels)
    expect(Math.max(...a!.map((v, i) => Math.abs(v - b![i]!)))).toBeLessThanOrEqual(8)
  })

  it('is a calm neutral teal in the middle of comfort', () => {
    expect(temperatureColor(22, 27)).toBe('#5eead4')
  })

  it('lies halfway between two stops at their midpoint', () => {
    expect(channels(temperatureColor(21, 27))).toEqual([110, 223, 232])
  })

  it('never passes through green on the way to red', () => {
    const greenish = Array.from({ length: 170 }, (_, i) => 13 + i / 10)
      .map((value) => channels(temperatureColor(value, 27)))
      .filter(([r, g, b]) => g! > r! + 40 && g! > b! + 40)
    expect(greenish).toEqual([])
  })

  it('paints a room with no reading black', () => {
    expect(temperatureColor(0, 27)).toBe('#000000')
  })
})

describe('the gradient the scene legend draws for temperature', () => {
  it('spreads every stop along the bar, coldest at the left edge and the limit at the right', () => {
    expect(temperatureGradient()).toBe(
      'linear-gradient(to right, #2563EB 0%, #7DD3FC 41.67%, #5EEAD4 58.33%, #CBD5E1 66.67%, #FBBF24 75%, #F97316 91.67%, #DC2626 100%)',
    )
  })
})

describe('the smooth colour a room takes for its air quality', () => {
  it.each([
    [0.01, '#5eead4'],
    [50, '#fbbf24'],
    [100, '#dc2626'],
    [300, '#dc2626'],
  ])('index %s paints %s', (value, color) => {
    expect(aqiColor(value)).toBe(color)
  })

  it('stays teal through clean air', () => {
    expect(aqiColor(15)).toBe('#5eead4')
    expect(aqiColor(30)).toBe('#5eead4')
  })

  it('blends between stops instead of jumping', () => {
    expect(channels(aqiColor(46))).toEqual([227, 202, 131])
  })

  it('never passes through green on the way to red', () => {
    const greenish = Array.from({ length: 150 }, (_, i) => i + 1)
      .map((value) => channels(aqiColor(value)))
      .filter(([r, g, b]) => g! > r! + 40 && g! > b! + 40)
    expect(greenish).toEqual([])
  })

  it('paints a room with no reading black', () => {
    expect(aqiColor(0)).toBe('#000000')
  })

  it('spreads its stops along the legend bar', () => {
    expect(aqiGradient()).toBe(
      'linear-gradient(to right, #5EEAD4 0%, #5EEAD4 30%, #CBD5E1 42%, #FBBF24 50%, #F97316 75%, #DC2626 100%)',
    )
  })
})

describe('the colour a room takes in air quality mode', () => {
  it.each([
    [10, '#10B981'],
    [60, '#F59E0B'],
    [80, '#D97706'],
    [150, '#EF4444'],
  ])('index %s paints %s', (value, color) => {
    expect(roomColorByAirQuality(value)).toBe(color)
  })
})
