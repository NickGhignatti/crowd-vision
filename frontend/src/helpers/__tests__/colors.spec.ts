import { describe, it, expect } from 'vitest'
import {
  roomColorStandard,
  roomColorByTemperature,
  roomColorByAirQuality,
  roomColorOverlapWarning,
  roomOpacity,
} from '../colors'

describe('colors helper', () => {
  describe('roomColorStandard', () => {
    it('returns the standard room color', () => {
      expect(roomColorStandard()).toBe('#e2e8f0')
    })
  })

  describe('roomColorByTemperature', () => {
    // ── Special zero sentinel ──────────────────────────────────────────────
    it('returns black for exactly 0.0 (no sensor data)', () => {
      expect(roomColorByTemperature(0.0)).toBe('#000000')
    })

    // ── Below-16 band (dark blue) ──────────────────────────────────────────
    it('returns dark blue for a typical cold temperature (< 16)', () => {
      expect(roomColorByTemperature(15.9)).toBe('#1E3A8A')
    })

    it('returns dark blue for a negative temperature', () => {
      // Negative values are not 0, so they fall into the < 16 branch.
      expect(roomColorByTemperature(-5)).toBe('#1E3A8A')
      expect(roomColorByTemperature(-0.001)).toBe('#1E3A8A')
    })

    it('returns dark blue for a temperature just below 16', () => {
      expect(roomColorByTemperature(15.999)).toBe('#1E3A8A')
    })

    // ── 16–18 band (light blue) ────────────────────────────────────────────
    it('returns light blue for temperature exactly at the 16.0 boundary', () => {
      expect(roomColorByTemperature(16.0)).toBe('#0EA5E9')
    })

    it('returns light blue for temperature within the 16–19 band', () => {
      expect(roomColorByTemperature(18.9)).toBe('#0EA5E9')
    })

    // ── 19–23 band (green) ─────────────────────────────────────────────────
    it('returns green for temperature exactly at the 19.0 boundary', () => {
      expect(roomColorByTemperature(19.0)).toBe('#10B981')
    })

    it('returns green for temperature within the 19–24 band', () => {
      expect(roomColorByTemperature(23.9)).toBe('#10B981')
    })

    // ── 24–26 band (amber) ─────────────────────────────────────────────────
    it('returns amber for temperature exactly at the 24.0 boundary', () => {
      expect(roomColorByTemperature(24.0)).toBe('#F59E0B')
    })

    it('returns amber for temperature within the 24–27 band', () => {
      expect(roomColorByTemperature(26.9)).toBe('#F59E0B')
    })

    // ── ≥27 band (red) ────────────────────────────────────────────────────
    it('returns red for temperature exactly at the 27.0 boundary', () => {
      expect(roomColorByTemperature(27.0)).toBe('#EF4444')
    })

    it('returns red for a high temperature well above 27', () => {
      expect(roomColorByTemperature(35.0)).toBe('#EF4444')
      expect(roomColorByTemperature(100.0)).toBe('#EF4444')
    })

    // ── Float precision near boundaries ──────────────────────────────────
    it('returns dark blue for a float that is just barely less than 16', () => {
      expect(roomColorByTemperature(15.9999)).toBe('#1E3A8A')
    })

    it('returns amber for a float that is just barely less than 27', () => {
      expect(roomColorByTemperature(26.9999)).toBe('#F59E0B')
    })
  })

  describe('roomColorByAirQuality', () => {
    // ── Special zero sentinel ──────────────────────────────────────────────
    it('returns black for exactly 0.0 (no IAQI data)', () => {
      expect(roomColorByAirQuality(0.0)).toBe('#000000')
    })

    // ── Negative IAQI ─────────────────────────────────────────────────────
    it('returns green for a negative IAQI value (treated as < 50)', () => {
      // Negative is not 0.0, so it falls into the < 50 green branch.
      expect(roomColorByAirQuality(-1)).toBe('#10B981')
    })

    // ── 0–49 band (green) ─────────────────────────────────────────────────
    it('returns green for an IAQI in the good range', () => {
      expect(roomColorByAirQuality(25.0)).toBe('#10B981')
      expect(roomColorByAirQuality(49.9)).toBe('#10B981')
    })

    // ── 50–74 band (orange) ───────────────────────────────────────────────
    it('returns orange for IAQI exactly at the 50 boundary', () => {
      expect(roomColorByAirQuality(50.0)).toBe('#F59E0B')
    })

    it('returns orange for IAQI within the 50–75 band', () => {
      expect(roomColorByAirQuality(74.9)).toBe('#F59E0B')
    })

    // ── 75–99 band (darker orange) ────────────────────────────────────────
    it('returns darker orange for IAQI exactly at the 75 boundary', () => {
      expect(roomColorByAirQuality(75.0)).toBe('#D97706')
    })

    it('returns darker orange for IAQI within the 75–100 band', () => {
      expect(roomColorByAirQuality(99.9)).toBe('#D97706')
    })

    // ── ≥100 band (red) ───────────────────────────────────────────────────
    it('returns red for IAQI exactly at the 100 boundary', () => {
      expect(roomColorByAirQuality(100.0)).toBe('#EF4444')
    })

    it('returns red for IAQI well above 100', () => {
      expect(roomColorByAirQuality(150.0)).toBe('#EF4444')
      expect(roomColorByAirQuality(500.0)).toBe('#EF4444')
    })

    // ── Float precision near boundaries ──────────────────────────────────
    it('returns green for IAQI just below 50', () => {
      expect(roomColorByAirQuality(49.999)).toBe('#10B981')
    })

    it('returns darker orange for IAQI just below 100', () => {
      expect(roomColorByAirQuality(99.999)).toBe('#D97706')
    })
  })

  describe('roomColorOverlapWarning', () => {
    it('returns the overlap-warning color', () => {
      expect(roomColorOverlapWarning()).toBe('#f87171')
    })
  })

  describe('roomOpacity', () => {
    it('returns the higher opacity value when the room is selected', () => {
      expect(roomOpacity(true)).toBe(0.17)
    })

    it('returns the lower opacity value when the room is not selected', () => {
      expect(roomOpacity(false)).toBe(0.1)
    })
  })
})
