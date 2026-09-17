import { describe, expect, it } from 'vitest'
import {
  AQI_BANDS,
  TEMPERATURE_BANDS,
  bandRanges,
  roomColorByAirQuality,
  roomColorByTemperature,
  SHELL_COLOR,
  roomShell,
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

describe('the ghost shell a room is drawn as', () => {
  it('is nearly clear face-on and firmer toward its silhouette', () => {
    expect(roomShell(false)).toMatchObject({ base: 0.04, strength: 0.45, power: 2 })
  })

  it('glows along its edges, a few pixels wide at any zoom', () => {
    expect(roomShell(false)).toMatchObject({ edgeWidth: 4, edgeStrength: 0.5 })
  })

  it('makes the selected room stand out from the rest', () => {
    expect(roomShell(true).edgeStrength).toBeGreaterThan(roomShell(false).edgeStrength)
    expect(roomShell(true).base).toBeGreaterThan(roomShell(false).base)
    expect(roomShell(true).strength).toBeGreaterThan(roomShell(false).strength)
  })

  it('is slate on the light theme, where pale grey has no contrast', () => {
    expect(SHELL_COLOR).toEqual({ light: '#64748b', dark: '#e2e8f0' })
  })
})
