import { onMounted, ref } from 'vue'
import type { UnifiedDomainGroup } from '@/types/domains/domain.ts'
import { canManageDomain } from '@/utils/domains/roles.ts'
import { managedDomainGroups } from '@/utils/domains/domains.ts'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domains/domain.ts'
import { useAuthStore } from '@/stores/authentication/authentication.ts'
import { useNotificationStore } from '@/stores/commons/notification.ts'

/** The domains the administration panel manages, with their subdomains and alert switches. */
export function useManagedDomains() {
  const domainsStore = useDomainsStore()
  const subdomainsStore = useSubdomainsStore()
  const authStore = useAuthStore()
  const notificationStore = useNotificationStore()

  const groups = ref<UnifiedDomainGroup[]>([])
  const isLoading = ref(true)

  const refresh = async () => {
    isLoading.value = true
    try {
      await domainsStore.fetchMemberships()
      const managed = (domainsStore.memberships ?? []).filter((m) => canManageDomain(m.role))
      await subdomainsStore.fetch(managed)
      groups.value = managedDomainGroups(managed, subdomainsStore.byDomain)
    } finally {
      isLoading.value = false
    }
  }

  // A new subdomain lives in the subdomain cache, a new top-level domain in the memberships.
  const invalidate = (isSubdomain: boolean) =>
    isSubdomain ? subdomainsStore.invalidate() : domainsStore.invalidate()

  onMounted(async () => {
    await refresh()
    await notificationStore.fetchAccountNotificationPreference(authStore.accountName ?? '')
  })

  return { groups, isLoading, refresh, invalidate }
}
