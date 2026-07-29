export const ROLE_META: Record<string, { i18nKey: string; badge: string; tab: string }> = {
  admin: {
    i18nKey: 'domains.roles.admin',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    tab: 'text-purple-700 border-purple-500 bg-purple-50',
  },
  business_admin: {
    i18nKey: 'domains.roles.businessAdmin',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    tab: 'text-blue-700 border-blue-500 bg-blue-50',
  },
  business_staff: {
    i18nKey: 'domains.roles.businessStaff',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    tab: 'text-emerald-700 border-emerald-500 bg-emerald-50',
  },
  standard_customer: {
    i18nKey: 'domains.roles.standardCustomer',
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    tab: 'text-gray-700 border-gray-500 bg-gray-50',
  },
}

export const getRoleMeta = (role: string) => {
  return ROLE_META[role.toLowerCase()] || ROLE_META.standard_customer
}

// Roles that grant management actions within a domain. A standard_customer is
// read-only, so it can neither upload nor administer the domain.
export const MANAGEMENT_ROLES = ['admin', 'business_admin', 'business_staff']

export const canManageDomain = (role: string) => MANAGEMENT_ROLES.includes(role.toLowerCase())
