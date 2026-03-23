import { ref, onMounted } from 'vue'
import type { DomainMembership } from '@/models/domain'
import { authenticatedFetch } from '@/composables/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'

export function useUserPermissions() {
  const memberships = ref<DomainMembership[]>([])
  const authStore = useAuthStore()

  // Fetch the user's roles for all domains
  const fetchPermissions = async () => {
    try {
      const accountName = authStore.accountName
      if (!accountName) return

      const response = await authenticatedFetch(`/auth/domains/${accountName}`)
      const data = await response.json()

      // The API returns { domains: [...] } where items are Memberships
      if (data && data.domains) {
        memberships.value = data.domains
      }
    } catch (e) {
      console.error('Failed to fetch permissions', e)
      memberships.value = []
    }
  }

  // A building is editable only for memberships at or above business admin level.
  const canEdit = (buildingDomains: string[]): boolean => {
    if (!buildingDomains || buildingDomains.length === 0) return false

    return memberships.value.some(
      (m) => buildingDomains.includes(m.domainName) && ['business_admin', 'business_staff', 'admin'].includes(m.role),
    )
  }

  onMounted(async () => {
    await fetchPermissions()
  })

  return {
    memberships,
    fetchPermissions,
    canEdit,
  }
}
