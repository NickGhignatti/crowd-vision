import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import DomainsTable from '@/components/tables/DomainsTable.vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { DomainRow } from '@/interfaces/domain'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/core/useApi.ts', () => ({
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
  props: ['id', 'name', 'isSubscribed', 'isPrivate', 'role', 'memberCount', 'buildingCount'],
  emits: ['subscribe', 'unsubscribe'],
  template: '<tr class="domain-row-stub" :data-subscribed="isSubscribed"></tr>',
}

const stubs = {
  DomainRecord: DomainRowStub,
}

const makeRow = (name: string, overrides: Partial<DomainRow> = {}): DomainRow => ({
  name,
  authStrategy: 'internal',
  isPrivate: false,
  isSubscribed: false,
  ...overrides,
})

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

describe('DomainsTable', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountName.value = 'alice'

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
    it('displays the empty state when no rows are provided', () => {
      const wrapper = mount(DomainsTable, {
        props: { rows: [] },
        global: { stubs },
      })

      expect(wrapper.text()).toContain('domains.inputs.notFound')
      expect(wrapper.findComponent(DomainRowStub).exists()).toBe(false)
    })

    it('renders a DomainRecord for each row', () => {
      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('acme'), makeRow('globex')] },
        global: { stubs },
      })

      const rows = wrapper.findAllComponents(DomainRowStub)
      expect(rows).toHaveLength(2)
      expect(rows[0]?.props('name')).toBe('acme')
      expect(rows[1]?.props('name')).toBe('globex')
    })

    it('forwards subscription, role, privacy and count props per row', () => {
      const wrapper = mount(DomainsTable, {
        props: {
          rows: [
            makeRow('acme', { isSubscribed: true, role: 'business_admin', memberCount: 5 }),
            makeRow('secret', { isPrivate: true, role: 'standard_customer', buildingCount: 2 }),
          ],
        },
        global: { stubs },
      })

      const rows = wrapper.findAllComponents(DomainRowStub)
      expect(rows[0]?.props('isSubscribed')).toBe(true)
      expect(rows[0]?.props('role')).toBe('business_admin')
      expect(rows[0]?.props('memberCount')).toBe(5)
      expect(rows[1]?.props('isPrivate')).toBe(true)
      expect(rows[1]?.props('buildingCount')).toBe(2)
    })
  })

  describe('subscribe (Internal Strategy)', () => {
    it('calls the subscribe API and emits refresh on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('acme', { authStrategy: 'internal' })] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/alice/subscribe', 'POST', {
        body: JSON.stringify({ domainName: 'acme' }),
      })
      expect(wrapper.emitted('refresh')).toBeTruthy()
    })

    it('does not emit refresh when the API fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false) as unknown as Response)

      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('acme', { authStrategy: 'internal' })] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises()

      expect(wrapper.emitted('refresh')).toBeFalsy()
      errorSpy.mockRestore()
    })
  })

  describe('subscribe (OIDC Strategy)', () => {
    it('calls the SSO login endpoint and redirects to the Identity Provider', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { redirectUrl: 'https://sso.provider.com/login' }) as unknown as Response,
      )

      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('unibo', { authStrategy: 'oidc' })] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await flushPromises()

      expect(makeRequest).toHaveBeenCalledWith('/auth/sso/login/unibo?accountName=alice')
      expect(window.location.href).toBe('https://sso.provider.com/login')
      expect(wrapper.emitted('refresh')).toBeFalsy()
    })
  })

  describe('unsubscribe', () => {
    it('calls the unsubscribe API and emits refresh on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('acme', { isSubscribed: true })] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('unsubscribe', 0)
      await flushPromises()

      expect(makeRequest).toHaveBeenCalledWith('/auth/domains/alice/unsubscribe', 'DELETE', {
        body: JSON.stringify({ domainName: 'acme' }),
      })
      expect(wrapper.emitted('refresh')).toBeTruthy()
    })
  })

  describe('private rows', () => {
    it('ignores subscribe/unsubscribe on a private row', async () => {
      const wrapper = mount(DomainsTable, {
        props: { rows: [makeRow('secret', { isPrivate: true, isSubscribed: true })] },
        global: { stubs },
      })

      await wrapper.findComponent(DomainRowStub).vm.$emit('subscribe', 0)
      await wrapper.findComponent(DomainRowStub).vm.$emit('unsubscribe', 0)
      await flushPromises()

      expect(makeRequest).not.toHaveBeenCalled()
    })
  })
})
