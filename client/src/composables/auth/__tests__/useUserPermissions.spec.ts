import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import { useDomainsStore } from '@/stores/domain.ts'

// ---------------------------------------------------------------------------
// Helper: mounts the composable inside a minimal host component so that Vue
// lifecycle hooks (onMounted) are exercised exactly as they would be in prod.
// ---------------------------------------------------------------------------
function mountComposable() {
  let composable!: ReturnType<typeof useUserPermissions>

  const Host = defineComponent({
    setup() {
      composable = useUserPermissions()
      return () => null
    },
  })

  const wrapper = mount(Host)
  return { composable, wrapper }
}

describe('useUserPermissions', () => {
  beforeEach(() => {
    // Stub fetchMemberships at the store level for every test so that the
    // onMounted call never reaches useApi or the network. The onMounted
    // section re-spies explicitly to also assert call counts.
    vi.spyOn(useDomainsStore(), 'fetchMemberships').mockResolvedValue()
  })

  describe('memberships', () => {
    it('returns an empty array when the store memberships are null (initial state)', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = null

      const { composable } = mountComposable()

      expect(composable.memberships.value).toEqual([])
    })

    it('returns an empty array when the store memberships are an empty array', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = []

      const { composable } = mountComposable()

      expect(composable.memberships.value).toEqual([])
    })

    it('returns the store memberships when they are populated', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [
        { domainName: 'domain-a', role: 'business_admin' },
        { domainName: 'domain-b', role: 'standard_customer' },
      ]

      const { composable } = mountComposable()

      expect(composable.memberships.value).toHaveLength(2)
      expect(composable.memberships.value[0]).toMatchObject({ domainName: 'domain-a' })
    })

    it('is reactive — updates automatically when the store changes after mount', async () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = null

      const { composable } = mountComposable()
      expect(composable.memberships.value).toEqual([])

      domainsStore.memberships = [{ domainName: 'domain-a', role: 'admin' }]
      await nextTick()

      expect(composable.memberships.value).toHaveLength(1)
      expect(composable.memberships.value[0]?.domainName).toBe('domain-a')
    })
  })

  describe('canEdit — input guards', () => {
    beforeEach(() => {
      // Give the user an edit-capable membership so any "false" result below
      // is caused by the bad input, not by the membership logic.
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'domain-a', role: 'business_admin' }]
    })

    it('returns false when buildingDomains is an empty array', () => {
      const { composable } = mountComposable()

      expect(composable.canEdit([])).toBe(false)
    })

    it('returns false when buildingDomains is null (defensive, beyond TypeScript)', () => {
      const { composable } = mountComposable()

      expect(composable.canEdit(null as any)).toBe(false)
    })

    it('returns false when buildingDomains is undefined (defensive, beyond TypeScript)', () => {
      const { composable } = mountComposable()

      expect(composable.canEdit(undefined as any)).toBe(false)
    })
  })

  describe('canEdit — role-based access', () => {
    const DOMAIN = 'domain-a'

    it('grants edit access to "admin" role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'admin' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(true)
    })

    it('grants edit access to "business_admin" role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'business_admin' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(true)
    })

    it('grants edit access to "business_staff" role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'business_staff' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(true)
    })

    it('denies edit access to "standard_customer" role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'standard_customer' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(false)
    })

    it('denies edit access to an unrecognised / arbitrary role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'mystery_role' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(false)
    })

    it('role check is case-sensitive — "BUSINESS_ADMIN" does not grant access', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: DOMAIN, role: 'BUSINESS_ADMIN' }]

      const { composable } = mountComposable()

      expect(composable.canEdit([DOMAIN])).toBe(false)
    })
  })

  describe('canEdit — domain matching', () => {
    it('returns false when the user has an edit role but for a different domain', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'domain-a', role: 'business_admin' }]

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-b'])).toBe(false)
    })

    it('returns true when at least one of the supplied building domains matches', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'domain-b', role: 'business_staff' }]

      const { composable } = mountComposable()

      // domain-a does not match, domain-b does
      expect(composable.canEdit(['domain-a', 'domain-b', 'domain-c'])).toBe(true)
    })

    it('returns false when none of the supplied building domains match any membership', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [{ domainName: 'domain-z', role: 'admin' }]

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-a', 'domain-b'])).toBe(false)
    })

    it('returns false when there are no memberships at all', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = []

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-a'])).toBe(false)
    })

    it('returns false when memberships is null (store not yet hydrated)', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = null

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-a'])).toBe(false)
    })
  })

  describe('canEdit — multiple memberships', () => {
    it('returns true if the first matching membership has an edit role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [
        { domainName: 'domain-a', role: 'business_admin' },
        { domainName: 'domain-b', role: 'standard_customer' },
      ]

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-a'])).toBe(true)
    })

    it('returns true if only the second membership matches with an edit role', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [
        { domainName: 'domain-a', role: 'standard_customer' },
        { domainName: 'domain-b', role: 'business_staff' },
      ]

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-b'])).toBe(true)
    })

    it('returns false when multiple memberships exist but none have an edit role for the target domain', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [
        { domainName: 'domain-a', role: 'standard_customer' },
        { domainName: 'domain-a', role: 'mystery_role' },
      ]

      const { composable } = mountComposable()

      expect(composable.canEdit(['domain-a'])).toBe(false)
    })

    it('returns true when the user has edit access across different domains and any one matches', () => {
      const domainsStore = useDomainsStore()
      domainsStore.memberships = [
        { domainName: 'domain-a', role: 'admin' },
        { domainName: 'domain-b', role: 'business_staff' },
        { domainName: 'domain-c', role: 'standard_customer' },
      ]

      const { composable } = mountComposable()

      // BuildingsSelector belongs to domain-c only (no edit role), domain-b (edit role) — should be true
      expect(composable.canEdit(['domain-b', 'domain-c'])).toBe(true)
    })
  })

  describe('onMounted', () => {
    it('calls fetchMemberships on mount', () => {
      const domainsStore = useDomainsStore()
      const fetchSpy = vi.spyOn(domainsStore, 'fetchMemberships').mockResolvedValue()

      mountComposable()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('does not call fetchMemberships more than once per mount', () => {
      const domainsStore = useDomainsStore()
      const fetchSpy = vi.spyOn(domainsStore, 'fetchMemberships').mockResolvedValue()

      mountComposable()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('calls fetchMemberships independently for each mounted instance', () => {
      const domainsStore = useDomainsStore()
      const fetchSpy = vi.spyOn(domainsStore, 'fetchMemberships').mockResolvedValue()

      mountComposable()
      mountComposable()

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })
})
