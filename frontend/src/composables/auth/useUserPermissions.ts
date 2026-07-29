import { computed, onMounted } from 'vue'
import { useDomainsStore } from '@/stores/domain.ts'

export function useUserPermissions() {
  const domainsStore = useDomainsStore()

  const memberships = computed(() => domainsStore.memberships ?? [])

  const canEdit = (buildingDomains: string[]): boolean => {
    if (!buildingDomains?.length) return false
    return memberships.value.some(
      (m) =>
        buildingDomains.includes(m.domainName) &&
        ['business_admin', 'business_staff', 'admin'].includes(m.role),
    )
  }

  onMounted(() => domainsStore.fetchMemberships())

  return { memberships, canEdit }
}
