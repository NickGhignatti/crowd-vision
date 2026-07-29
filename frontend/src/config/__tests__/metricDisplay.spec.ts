import { describe, it, expect } from 'vitest'
import { METRIC_DISPLAY, percentColor } from '../metricDisplay'
import { roomColorByTemperature, roomColorByAirQuality } from '@/helpers/colors'
import type { TableBody } from '@/models/table.ts'

const row = (capacity: string): TableBody =>
  ({ capacity } as unknown as TableBody)

describe('metricDisplay', () => {
  describe('percentColor', () => {
    it('returns slate when capacity is missing or zero', () => {
      expect(percentColor(10, row('0'))).toBe('#94A3B8')
      expect(percentColor(10, row(''))).toBe('#94A3B8')
    })

    it('returns slate for an empty room (value 0)', () => {
      expect(percentColor(0, row('120'))).toBe('#94A3B8')
    })

    it('returns blue up to and including 50% occupancy', () => {
      expect(percentColor(1, row('120'))).toBe('#3B82F6')
      expect(percentColor(60, row('120'))).toBe('#3B82F6') // exactly 50%
    })

    it('returns orange between 50% and 95%', () => {
      expect(percentColor(61, row('120'))).toBe('#F97316')
      expect(percentColor(114, row('120'))).toBe('#F97316') // exactly 95%
    })

    it('returns red above 95% and when over capacity', () => {
      expect(percentColor(115, row('120'))).toBe('#EF4444')
      expect(percentColor(120, row('120'))).toBe('#EF4444')
      expect(percentColor(200, row('120'))).toBe('#EF4444')
    })
  })

  describe('registry', () => {
    it('renders capacity and room name as plain text', () => {
      expect(METRIC_DISPLAY.roomName!.renderer).toBe('text')
      expect(METRIC_DISPLAY.roomMaxOccupancy!.renderer).toBe('text')
    })

    it('renders occupancy as a bar bounded by the room capacity', () => {
      const display = METRIC_DISPLAY.peopleCount!
      expect(display.renderer).toBe('bar')
      expect(display.range!(row('120'))).toEqual({ min: 0, max: 120 })
    })

    it('delegates temperature colour to the temperature helper', () => {
      const display = METRIC_DISPLAY.temperature!
      expect(display.renderer).toBe('gauge')
      expect(display.color!(22, row('0'))).toBe(roomColorByTemperature(22))
    })

    it('delegates air-quality colour to the air-quality helper', () => {
      const display = METRIC_DISPLAY.airQuality!
      expect(display.renderer).toBe('gauge')
      expect(display.color!(60, row('0'))).toBe(roomColorByAirQuality(60))
    })

    it('renders status as a pill', () => {
      expect(METRIC_DISPLAY.status!.renderer).toBe('pill')
    })
  })
})
