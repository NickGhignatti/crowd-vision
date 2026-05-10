import { describe, it, expect } from 'vitest'
import {
  roomColorStandard,
  roomColorByTemperature,
  roomColorByAirQuality,
  roomOpacity,
} from '../colors'

describe('colors helper', () => {
  describe('roomColorStandard', () => {
    it('returns the standard room color', () => {
      expect(roomColorStandard()).toBe('#e2e8f0')
    })
  })

  describe('roomColorByTemperature', () => {
    it('returns black for 0.0 temperature', () => {
      expect(roomColorByTemperature(0.0)).toBe('#000000')
    })

    it('returns dark blue for temperature < 16.0', () => {
      expect(roomColorByTemperature(15.9)).toBe('#1E3A8A')
    })

    it('returns light blue for temperature >= 16.0 and < 19.0', () => {
      expect(roomColorByTemperature(16.0)).toBe('#0EA5E9')
      expect(roomColorByTemperature(18.9)).toBe('#0EA5E9')
    })

    it('returns green for temperature >= 19.0 and < 24.0', () => {
      expect(roomColorByTemperature(19.0)).toBe('#10B981')
      expect(roomColorByTemperature(23.9)).toBe('#10B981')
    })

    it('returns orange for temperature >= 24.0 and < 27.0', () => {
      expect(roomColorByTemperature(24.0)).toBe('#F59E0B')
      expect(roomColorByTemperature(26.9)).toBe('#F59E0B')
    })

    it('returns red for temperature >= 27.0', () => {
      expect(roomColorByTemperature(27.0)).toBe('#EF4444')
      expect(roomColorByTemperature(35.0)).toBe('#EF4444')
    })
  })

  describe('roomColorByAirQuality', () => {
    it('returns black for 0.0 IAQI', () => {
      expect(roomColorByAirQuality(0.0)).toBe('#000000')
    })

    it('returns green for IAQI < 50.0', () => {
      expect(roomColorByAirQuality(25.0)).toBe('#10B981')
      expect(roomColorByAirQuality(49.9)).toBe('#10B981')
    })

    it('returns orange for IAQI >= 50.0 and < 75.0', () => {
      expect(roomColorByAirQuality(50.0)).toBe('#F59E0B')
      expect(roomColorByAirQuality(74.9)).toBe('#F59E0B')
    })

    it('returns darker orange for IAQI >= 75.0 and < 100.0', () => {
      expect(roomColorByAirQuality(75.0)).toBe('#D97706')
      expect(roomColorByAirQuality(99.9)).toBe('#D97706')
    })

    it('returns red for IAQI >= 100.0', () => {
      expect(roomColorByAirQuality(100.0)).toBe('#EF4444')
      expect(roomColorByAirQuality(150.0)).toBe('#EF4444')
    })
  })

  describe('roomOpacity', () => {
    it('returns higher opacity when selected', () => {
      expect(roomOpacity(true)).toBe(0.17)
    })

    it('returns lower opacity when not selected', () => {
      expect(roomOpacity(false)).toBe(0.1)
    })
  })
})
