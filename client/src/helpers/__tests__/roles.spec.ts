import { describe, it, expect } from 'vitest'
import { ROLE_META, getRoleMeta } from '@/helpers/roles'

describe('roles helper', () => {

  describe('ROLE_META', () => {
    it('defines exactly the four expected roles', () => {
      expect(Object.keys(ROLE_META)).toEqual([
        'admin',
        'business_admin',
        'business_staff',
        'standard_customer',
      ])
    })

    it.each(['admin', 'business_admin', 'business_staff', 'standard_customer'])(
      '"%s" entry has an i18nKey, a badge and a tab field',
      (role) => {
        expect(ROLE_META[role]).toHaveProperty('i18nKey')
        expect(ROLE_META[role]).toHaveProperty('badge')
        expect(ROLE_META[role]).toHaveProperty('tab')
      },
    )
  })

  describe('getRoleMeta — per-role field completeness', () => {
    it.each(['admin', 'business_admin', 'business_staff', 'standard_customer'])(
      '"%s" — i18nKey is defined and non-empty',
      (role) => {
        const meta = getRoleMeta(role)
        expect(meta?.i18nKey).toBeDefined()
        expect(meta?.i18nKey.length).toBeGreaterThan(0)
      },
    )

    it.each(['admin', 'business_admin', 'business_staff', 'standard_customer'])(
      '"%s" — badge is defined and non-empty',
      (role) => {
        const meta = getRoleMeta(role)
        expect(meta?.badge).toBeDefined()
        expect(meta?.badge.length).toBeGreaterThan(0)
      },
    )

    it.each(['admin', 'business_admin', 'business_staff', 'standard_customer'])(
      '"%s" — tab is defined and non-empty',
      (role) => {
        const meta = getRoleMeta(role)
        expect(meta?.tab).toBeDefined()
        expect(meta?.tab.length).toBeGreaterThan(0)
      },
    )
  })

  describe('getRoleMeta — known roles', () => {
    it.each(['admin', 'business_admin', 'business_staff', 'standard_customer'])(
      'returns the correct ROLE_META entry for "%s"',
      (role) => {
        expect(getRoleMeta(role)).toBe(ROLE_META[role])
      },
    )
  })

  describe('getRoleMeta — fallback', () => {
    it('falls back to standard_customer when the lookup yields undefined', () => {
      // ROLE_META['nonexistent'] === undefined, so the || branch must fire
      expect(ROLE_META['nonexistent_role']).toBeUndefined()
      expect(getRoleMeta('nonexistent_role')).toBe(ROLE_META.standard_customer)
    })

    it('returns standard_customer meta for an unrecognised role', () => {
      expect(getRoleMeta('unknown_role')).toBe(ROLE_META.standard_customer)
    })
  })
})
