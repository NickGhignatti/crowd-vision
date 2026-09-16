import { describe, expect, it } from 'vitest'
import {
  AQI_BANDS,
  TEMPERATURE_BANDS,
  bandRanges,
  roomColorByAirQuality,
  roomColorByTemperature,
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

describe('the ranges the scene legend lists', () => {
  it('runs each band from where the previous one stops', () => {
    expect(bandRanges(AQI_BANDS).map(({ from, to }) => [from, to])).toEqual([
      [null, 50],
      [50, 75],
      [75, 100],
      [100, null],
    ])
  })

  it('keeps every band its colour and label', () => {
    expect(bandRanges(TEMPERATURE_BANDS)[0]).toMatchObject({ color: '#1E3A8A', key: 'cold' })
  })
})
