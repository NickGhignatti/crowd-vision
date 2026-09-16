import type { Domain, DomainMembership } from '@/types/domains/domain.ts'
import type { UnifiedDomainGroup } from '@/types/domains/domain.ts'
import { canManageDomain } from '@/utils/domains/roles.ts'

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

const DOMAIN_NAME = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/

/** The full name a new domain gets: `main.master`, or whichever part is given. */
export const composeDomainName = (main: string, master: string): string =>
  [main, master].filter(Boolean).join('.')

export const isValidDomainName = (name: string): boolean => DOMAIN_NAME.test(name)

/**
 * Domains the user can manage, each with its subdomains. A managed domain that is itself a
 * subdomain of another is already nested there; names compare case-insensitively.
 */
export function managedDomainGroups(
  memberships: DomainMembership[],
  subdomainsByDomain: Record<string, string[]>,
): UnifiedDomainGroup[] {
  const managed = memberships.filter((m) => canManageDomain(m.role))
  const names = managed.map((m) => m.domainName.toLowerCase())
  const isNested = (name: string) =>
    names.some((other) => other !== name.toLowerCase() && name.toLowerCase().endsWith(`.${other}`))

  return managed
    .filter((m) => !isNested(m.domainName))
    .map((m) => ({
      name: m.domainName,
      role: m.role,
      canUpload: true,
      subdomains: (subdomainsByDomain[m.domainName] ?? []).map((name) => ({
        name,
        displayName: name.replace(`.${m.domainName}`, ''),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
