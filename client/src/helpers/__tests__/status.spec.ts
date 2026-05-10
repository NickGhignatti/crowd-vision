import { describe, it, expect } from 'vitest'
import { getStatusByOccupants, getStatusColor } from '../status'

describe('status helper', () => {
  describe('getStatusByOccupants', () => {
    it('returns empty status when occupants is 0', () => {
      expect(getStatusByOccupants(0, 10)).toBe('dashboards.table.rooms.status.empty')
    })

    it('returns normal status when occupants <= 50%', () => {
      expect(getStatusByOccupants(1, 10)).toBe('dashboards.table.rooms.status.normal')
      expect(getStatusByOccupants(5, 10)).toBe('dashboards.table.rooms.status.normal')
    })

    it('returns crowded status when occupants > 50% and <= 95%', () => {
      expect(getStatusByOccupants(6, 10)).toBe('dashboards.table.rooms.status.crowded')
      expect(getStatusByOccupants(9, 10)).toBe('dashboards.table.rooms.status.crowded')
      expect(getStatusByOccupants(9.5, 10)).toBe('dashboards.table.rooms.status.crowded')
    })

    it('returns full status when occupants > 95% and <= 100%', () => {
      expect(getStatusByOccupants(9.6, 10)).toBe('dashboards.table.rooms.status.full')
      expect(getStatusByOccupants(10, 10)).toBe('dashboards.table.rooms.status.full')
    })

    it('returns overcrowded status when occupants > 100%', () => {
      expect(getStatusByOccupants(11, 10)).toBe('dashboards.table.rooms.status.overcrowded')
    })
  })

  describe('getStatusColor', () => {
    it('returns empty string for empty status key', () => {
      expect(getStatusColor('')).toBe('')
    })

    it('returns emerald color for empty status', () => {
      expect(getStatusColor('dashboards.table.rooms.status.empty')).toBe('text-emerald-600 font-semibold')
    })

    it('returns blue color for normal status', () => {
      expect(getStatusColor('dashboards.table.rooms.status.normal')).toBe('text-blue-600')
    })

    it('returns orange color for crowded status', () => {
      expect(getStatusColor('dashboards.table.rooms.status.crowded')).toBe('text-orange-600')
    })

    it('returns red color for full status', () => {
      expect(getStatusColor('dashboards.table.rooms.status.full')).toBe('text-red-600 font-semibold')
    })

    it('returns red color for default/overcrowded status', () => {
      expect(getStatusColor('dashboards.table.rooms.status.overcrowded')).toBe('text-red-600 font-semibold')
      expect(getStatusColor('unknown')).toBe('text-red-600 font-semibold')
    })
  })
})
