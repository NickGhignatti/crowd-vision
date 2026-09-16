// tenancy's domainResponse (backend/tenancy/internal/api/handler.go), pinned by schemas/fixtures/tenancy-domains.json.
export interface Domain {
  id: string
  name: string
  displayName: string
  joinPolicy: string
  parentId?: string
  isPublic: boolean
  memberCount?: number
}

export interface DomainMembership {
  domainName: string
  role: string
  externalId?: string
}

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

export interface DomainToAddWithMaster {
  name: string
  masterDomain?: string
}

export interface DomainToAddWithVisibilityPayload extends DomainToAddWithMaster {
  isVisibleFromOutside: boolean
}

// A domain row in the redesigned Domains table: public domains plus the private
// domains the user belongs to, with role and counts overlaid.
export interface DomainRow {
  name: string
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
