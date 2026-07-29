import { describe, it, expect } from 'vitest'
import { getStatusByOccupants, getStatusColor } from '../status'

describe('status helper', () => {
  describe('getStatusByOccupants', () => {
    // ── Empty (0%) ────────────────────────────────────────────────────────
    it('returns empty when occupants is 0', () => {
      expect(getStatusByOccupants(0, 10)).toBe('dashboard.table.rooms.status.empty')
    })

    // ── Normal (0% < ratio ≤ 50%) ─────────────────────────────────────────
    it('returns normal for a single occupant in a large room', () => {
      expect(getStatusByOccupants(1, 10)).toBe('dashboard.table.rooms.status.normal')
    })

    it('returns normal at exactly 50% occupancy', () => {
      // 5/10 = 0.5 which satisfies ≤ 0.5
      expect(getStatusByOccupants(5, 10)).toBe('dashboard.table.rooms.status.normal')
    })

    it('returns normal just below the 50% boundary', () => {
      expect(getStatusByOccupants(4.99, 10)).toBe('dashboard.table.rooms.status.normal')
    })

    // ── Crowded (50% < ratio ≤ 95%) ───────────────────────────────────────
    it('returns crowded just above 50%', () => {
      expect(getStatusByOccupants(6, 10)).toBe('dashboard.table.rooms.status.crowded')
    })

    it('returns crowded for 90% occupancy', () => {
      expect(getStatusByOccupants(9, 10)).toBe('dashboard.table.rooms.status.crowded')
    })

    it('returns crowded at exactly 95% occupancy', () => {
      // 9.5/10 = 0.95 which satisfies ≤ 0.95
      expect(getStatusByOccupants(9.5, 10)).toBe('dashboard.table.rooms.status.crowded')
    })

    // ── Full (95% < ratio ≤ 100%) ─────────────────────────────────────────
    it('returns full just above 95%', () => {
      expect(getStatusByOccupants(9.6, 10)).toBe('dashboard.table.rooms.status.full')
    })

    it('returns full at exactly 100% occupancy', () => {
      expect(getStatusByOccupants(10, 10)).toBe('dashboard.table.rooms.status.full')
    })

    // ── Overcrowded (ratio > 100%) ────────────────────────────────────────
    it('returns overcrowded when occupants exceed capacity', () => {
      expect(getStatusByOccupants(11, 10)).toBe('dashboard.table.rooms.status.overcrowded')
    })

    it('returns overcrowded for heavily over-capacity rooms', () => {
      expect(getStatusByOccupants(20, 10)).toBe('dashboard.table.rooms.status.overcrowded')
    })

    // ── Edge cases ────────────────────────────────────────────────────────
    it('returns overcrowded when roomCapacity is 0 (0/0 = NaN, falls through to default)', () => {
      // NaN fails every comparison (=== 0, ≤ 0.5, ≤ 0.95, ≤ 1.0) so the
      // function returns overcrowded as the fall-through default.
      expect(getStatusByOccupants(0, 0)).toBe('dashboard.table.rooms.status.overcrowded')
    })

    it('returns normal for a floating-point ratio that barely crosses 50% threshold', () => {
      // 5.001 / 10 = 0.5001 > 0.5 → crowded
      expect(getStatusByOccupants(5.001, 10)).toBe('dashboard.table.rooms.status.crowded')
    })
  })

  describe('getStatusColor', () => {
    it('returns an empty string for an empty status key', () => {
      expect(getStatusColor('')).toBe('')
    })

    it('returns emerald color for the empty status', () => {
      expect(getStatusColor('dashboard.table.rooms.status.empty')).toBe(
        'text-emerald-600 font-semibold',
      )
    })

    it('returns blue color for the normal status', () => {
      expect(getStatusColor('dashboard.table.rooms.status.normal')).toBe('text-blue-600')
    })

    it('returns orange color for the crowded status', () => {
      expect(getStatusColor('dashboard.table.rooms.status.crowded')).toBe('text-orange-600')
    })

    it('returns red color for the full status', () => {
      expect(getStatusColor('dashboard.table.rooms.status.full')).toBe(
        'text-red-600 font-semibold',
      )
    })

    it('returns red color for the overcrowded status', () => {
      expect(getStatusColor('dashboard.table.rooms.status.overcrowded')).toBe(
        'text-red-600 font-semibold',
      )
    })

    it('returns the default (red) color for any unknown status key', () => {
      expect(getStatusColor('unknown')).toBe('text-red-600 font-semibold')
      expect(getStatusColor('some.other.key')).toBe('text-red-600 font-semibold')
    })
  })
})
