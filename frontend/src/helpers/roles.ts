import type { Tone } from '@/helpers/tone.ts'

export interface RoleMeta {
  i18nKey: string
  tone: Tone
}

export const ROLE_META: Record<string, RoleMeta> = {
  admin: { i18nKey: 'domains.roles.admin', tone: 'tertiary' },
  business_admin: { i18nKey: 'domains.roles.businessAdmin', tone: 'primary' },
  business_staff: { i18nKey: 'domains.roles.businessStaff', tone: 'secondary' },
  standard_customer: { i18nKey: 'domains.roles.standardCustomer', tone: 'neutral' },
}

export const getRoleMeta = (role: string): RoleMeta =>
  ROLE_META[role.toLowerCase()] ?? ROLE_META.standard_customer!

// A standard_customer is read-only, so it can neither upload nor administer the domain.
export const MANAGEMENT_ROLES = ['admin', 'business_admin', 'business_staff']

export const canManageDomain = (role: string) => MANAGEMENT_ROLES.includes(role.toLowerCase())
