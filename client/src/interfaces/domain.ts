import type { SSODomain } from '@/models/domain.ts'

export interface SubdomainItem {
  name: string
  displayName: string
}

export interface UnifiedDomainGroup {
  name: string
  role: string
  canUpload: boolean
  subdomains: SubdomainItem[]
}

export interface DomainToAddWithMaster extends SSODomain {
  masterDomain?: string
}

export interface DomainToAddWithVisibilityPayload extends DomainToAddWithMaster {
  isVisibleFromOutside: boolean
}

// A domain row in the redesigned Domains table: public domains plus the private
// domains the user belongs to, with role and counts overlaid.
export interface DomainRow {
  name: string
  authStrategy?: 'internal' | 'oidc'
  isPrivate: boolean
  role?: string
  isSubscribed: boolean
  memberCount?: number
  buildingCount?: number
}

export interface DomainSubscriptionRowProps {
  id: number
  name: string
  isSubscribed: boolean
  isPrivate: boolean
  role?: string
  memberCount?: number
  buildingCount?: number
}
