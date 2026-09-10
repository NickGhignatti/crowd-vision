import type { Domain, DomainMembership } from '@/models/domain.ts'

export interface MembershipWire {
  domain: string
  role: string
  externalId?: string
}

export const toMemberships = (data: unknown): DomainMembership[] =>
  Array.isArray(data)
    ? (data as MembershipWire[]).map((m) => ({
        domainName: m.domain,
        role: m.role,
        externalId: m.externalId,
      }))
    : []

export const memberCountsOf = (domains: Domain[]): Record<string, number> =>
  Object.fromEntries(domains.map((d) => [d.name, d.memberCount ?? 0]))

export const createDomainRequest = (name: string, isPublic: boolean) => ({
  name,
  displayName: name,
  isPublic,
})

export const joinRequest = (role: string) => ({ role })
