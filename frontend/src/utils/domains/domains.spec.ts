import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Domain } from '@/types/domains/domain.ts'
import {
  composeDomainName,
  createDomainRequest,
  isValidDomainName,
  joinRequest,
  managedDomainGroups,
  memberCountsOf,
  toMemberships,
} from './domains.ts'

const fixture = join(__dirname, '../../../../schemas/fixtures/tenancy-domains.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  domains: { name: string; body: Domain }[]
  memberships: unknown[]
  createDomain: unknown
  join: unknown
}

describe('what tenancy and the frontend exchange', () => {
  it('reads /me/memberships into domain memberships', () => {
    expect(toMemberships(wire.memberships)).toEqual([
      { domainName: 'eng', role: 'business_admin', externalId: undefined },
      { domainName: 'lab.eng', role: 'standard_customer', externalId: 'kc-42' },
    ])
  })

  it('reads an omitted memberCount as zero', () => {
    expect(memberCountsOf(wire.domains.map((d) => d.body))).toEqual({
      eng: 12,
      'lab.eng': 3,
      ops: 0,
    })
  })

  it('sends a create body exactly as the fixture records it', () => {
    expect(createDomainRequest('lab.eng', false)).toEqual(wire.createDomain)
  })

  it('sends a join body exactly as the fixture records it', () => {
    expect(joinRequest('standard_customer')).toEqual(wire.join)
  })
})

describe('naming a new domain', () => {
  it('nests the name under the chosen parent', () => {
    expect(composeDomainName('lab', 'unibo.it')).toBe('lab.unibo.it')
  })

  it('uses the parent alone when no name is typed', () => {
    expect(composeDomainName('', 'unibo.it')).toBe('unibo.it')
  })

  it('uses the name alone without a parent', () => {
    expect(composeDomainName('unibo.it', '')).toBe('unibo.it')
  })

  it.each(['unibo.it', 'lab.cs.unibo.it', 'my-lab.example.org'])('accepts %s', (name) => {
    expect(isValidDomainName(name)).toBe(true)
  })

  it.each(['', 'unibo', 'http://unibo.it', 'uni bo.it'])('refuses "%s"', (name) => {
    expect(isValidDomainName(name)).toBe(false)
  })
})

describe('the domains the administration panel manages', () => {
  const memberships = [
    { domainName: 'Kubeet', role: 'admin' },
    { domainName: 'sub.kubeet', role: 'business_staff' },
    { domainName: 'eng', role: 'standard_customer' },
    { domainName: 'alpha', role: 'business_admin' },
  ]

  it('lists only managed, top-level domains, sorted, with their subdomains', () => {
    expect(managedDomainGroups(memberships, { Kubeet: ['lab.Kubeet'] })).toEqual([
      { name: 'alpha', role: 'business_admin', canUpload: true, subdomains: [] },
      {
        name: 'Kubeet',
        role: 'admin',
        canUpload: true,
        subdomains: [{ name: 'lab.Kubeet', displayName: 'lab' }],
      },
    ])
  })
})
