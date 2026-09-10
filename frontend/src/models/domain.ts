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
