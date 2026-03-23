import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import DomainTable from '@/components/tables/DomainsTable.vue'
import { makeRequest } from '@/composables/useApi.ts'
import type { Domain, DomainMembership } from '@/models/domain'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useApi.ts', () => ({
  makeRequest: vi.fn(),
}))

const mockAccountName = ref<string | null>('alice')
vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: () => ({
    get accountName() {
      return mockAccountName.value
    },
  }),
}))

const DomainRowStub = {
  props: ['id', 'name', 'isSubscribed'],
  emits: ['subscribe', 'unsubscribe'],
  template: '<tr class="domain-row-stub" :data-subscribed="isSubscribed"></tr>',
}

const stubs = {
  DomainRow: DomainRowStub,
}

const makeDomain = (name: string, authStrategy: 'internal' | 'oidc' = 'internal'): Domain => ({
  name,
  authStrategy,
  subdomains: [],
})

const makeMembership = (domainName: string): DomainMembership => ({
  domainName,
  role: 'standard_customer',
})

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('DomainTable.vue', () => {
  // Capture the original window.location to restore it later
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountName.value = 'alice'

    // Safely mock window.location for redirect tests
    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      value: { href: '' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      value: originalLocation,
    })
  })

  describe('rendering', () => {
    it('displays the empty state when no domains are provided', () => {
      const wrapper = mount(DomainTable, {
        props: { domains: [], userMemberships: [] },
        global: { stubs },
      })

      expect(wrapper.text()).toContain('domains.inputs.notFound')
      expect(wrapper.findComponent(DomainRowStub).exists()).toBe(false)
    })

    it('renders a DomainRow for each domain', () => {
      const wrapper = mount(DomainTable, {
        props: {
          domains: [makeDomain('acme'), makeDomain('globex')],
          userMemberships: [],
        },
        global: { stubs },
      })

      const rows = wrapper.findAllComponents(DomainRowStub)
      expect(rows).toHaveLength(2)
      expect(rows[0]?.props('name')).toBe('acme')
      expect(rows[1]?.props('name')).toBe('globex')
    })

    it('maps userMemberships to the isSubscribed prop correctly', () => {
      const wrapper = mount(DomainTable, {
        props: {
          domains: [makeDomain('acme'), makeDomain('globex')],
          userMemberships: [makeMembership('globex')], // Only subscribed to globex
        },
        global: { stubs },
      })

      const rows = wrapper.findAllComponents(DomainRowStub)
      expect(rows[0]?.props('isSubscribed')).toBe(false)
      expect(rows[1]?.props('isSubscribed')).toBe(true)
    })
  })

  describe('subscribe (Internal Strategy)', () => {
    it('calls the subscribe API and emits refresh on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const wrapper = mount(DomainTable, {
        props: { domains: [makeDomain('acme', 'internal')], userMemberships: [] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises() // Wait for internal async makeRequest to resolve

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/alice/subscribe', 'POST', {
        body: JSON.stringify({ domainName: 'acme' }),
      })
      expect(wrapper.emitted('refresh')).toBeTruthy()
    })

    it('optimistically updates the row state, and reverts on API failure', async () => {
      // Suppress the expected console.error to keep terminal output clean
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Force API to fail
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const wrapper = mount(DomainTable, {
        props: { domains: [makeDomain('acme', 'internal')], userMemberships: [] },
        global: { stubs },
      })

      const row = wrapper.findComponent(DomainRowStub)

      // Before emit: false
      expect(row.props('isSubscribed')).toBe(false)

      await row.vm.$emit('subscribe', 0)
      await flushPromises() // Let the catch block execute and UI update

      // Because the API failed, it should catch the error and revert back to false
      expect(row.props('isSubscribed')).toBe(false)
      expect(wrapper.emitted('refresh')).toBeFalsy() // Shouldn't emit refresh on fail

      errorSpy.mockRestore()
    })
  })

  describe('subscribe (OIDC Strategy)', () => {
    it('calls the SSO login endpoint and redirects to the Identity Provider', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, {
          redirectUrl: 'https://sso.provider.com/login',
        }) as unknown as Response,
      )

      const wrapper = mount(DomainTable, {
        props: { domains: [makeDomain('unibo', 'oidc')], userMemberships: [] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises()

      expect(makeRequest).toHaveBeenCalledWith('/auth/sso/login/unibo?accountName=alice')
      expect(window.location.href).toBe('https://sso.provider.com/login')
      expect(wrapper.emitted('refresh')).toBeFalsy() // No refresh emitted for OIDC
    })

    it('does not redirect if the API response is not ok', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const wrapper = mount(DomainTable, {
        props: { domains: [makeDomain('unibo', 'oidc')], userMemberships: [] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises()

      expect(window.location.href).toBe('') // Unchanged
      errorSpy.mockRestore()
    })
  })

  describe('unsubscribe', () => {
    it('calls the unsubscribe API and emits refresh on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const wrapper = mount(DomainTable, {
        props: {
          domains: [makeDomain('acme')],
          userMemberships: [makeMembership('acme')],
        },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('unsubscribe', 0)
      await flushPromises()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/alice/unsubscribe', 'DELETE', {
        body: JSON.stringify({ domainName: 'acme' }),
      })
      expect(wrapper.emitted('refresh')).toBeTruthy()
    })

    it('optimistically updates the row state, and reverts on API failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Force API to fail
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const wrapper = mount(DomainTable, {
        props: {
          domains: [makeDomain('acme')],
          userMemberships: [makeMembership('acme')],
        },
        global: { stubs },
      })

      const row = wrapper.findComponent(DomainRowStub)

      // Before emit: true
      expect(row.props('isSubscribed')).toBe(true)

      await row.vm.$emit('unsubscribe', 0)
      await flushPromises() // Wait for internal catch block

      // Because the API failed, it should catch the error and revert back to true
      expect(row.props('isSubscribed')).toBe(true)
      expect(wrapper.emitted('refresh')).toBeFalsy()

      errorSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('aborts actions if accountName is null', async () => {
      mockAccountName.value = null

      const wrapper = mount(DomainTable, {
        props: { domains: [makeDomain('acme')], userMemberships: [] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)

      expect(makeRequest).not.toHaveBeenCalled()
    })
  })
})
