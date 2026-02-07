import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DomainsTable from '@/components/tables/DomainsTable.vue'
import DomainRow from '@/components/tables/components/DomainRow.vue'
import type { DomainPayload, DomainMembership } from '@/scripts/schema'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubEnv('VITE_SERVER_URL', 'http://test-api.com')

describe('DomainsTable.vue', () => {
  const mockItems: DomainPayload[] = [
    { name: 'domain-a', subdomains: [], authStrategy: 'internal' },
    { name: 'domain-b', subdomains: [], authStrategy: 'internal' },
  ]
  const mockUserMemberships: DomainMembership[] = [{ domainName: 'domain-a', role: 'viewer' }]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('username', 'TestUser')
  })

  it('initializes subscription state correctly', () => {
    const wrapper = mount(DomainsTable, {
      props: { items: mockItems, userMemberships: mockUserMemberships },
    })
    const rows = wrapper.findAllComponents(DomainRow)
    expect(rows[0].props('isSubscribed')).toBe(true)
    expect(rows[1].props('isSubscribed')).toBe(false)
  })

  it('handles subscription success', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const wrapper = mount(DomainsTable, {
      props: { items: mockItems, userMemberships: [] },
    })

    const firstRow = wrapper.findComponent(DomainRow)
    firstRow.vm.$emit('subscribe', 0) // Emit index 0
    await wrapper.vm.$nextTick() // Wait for update

    expect(firstRow.props('isSubscribed')).toBe(true)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api.com/auth/domains/TestUser/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ domainName: 'domain-a' }),
      }),
    )
  })

  it('reverts optimistic update on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(DomainsTable, {
      props: { items: mockItems, userMemberships: [] },
    })

    const firstRow = wrapper.findComponent(DomainRow)
    firstRow.vm.$emit('subscribe', 0)
    await wrapper.vm.$nextTick()

    await flushPromises()

    expect(firstRow.props('isSubscribed')).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})
