// Mirrors tenancy's domainResponse DTO (server/tenancy/internal/api/handler.go).
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
