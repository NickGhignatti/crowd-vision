import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Domain } from '@/models/domain.ts'
import { createDomainRequest, joinRequest, memberCountsOf, toMemberships } from './domains.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/tenancy-domains.json')
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
