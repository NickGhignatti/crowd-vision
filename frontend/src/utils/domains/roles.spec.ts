import { describe, expect, it } from 'vitest'
import { canManageDomain, getRoleMeta } from './roles.ts'

describe('how a domain role is shown', () => {
  it('ignores the case of the role', () => {
    expect(getRoleMeta('Business_Admin')).toEqual({
      i18nKey: 'domains.roles.businessAdmin',
      tone: 'primary',
    })
  })

  it('shows an unknown role as a standard customer', () => {
    expect(getRoleMeta('owner').i18nKey).toBe('domains.roles.standardCustomer')
  })
})

describe('who manages a domain', () => {
  it.each(['admin', 'business_admin', 'BUSINESS_STAFF'])('%s does', (role) => {
    expect(canManageDomain(role)).toBe(true)
  })

  it('a standard customer does not', () => {
    expect(canManageDomain('standard_customer')).toBe(false)
  })
})
