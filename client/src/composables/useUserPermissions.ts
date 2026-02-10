import { ref, onMounted } from 'vue'
import type { DomainMembership } from '@/models/domain'

export function useUserPermissions() {
  const memberships = ref<DomainMembership[]>([])
  const serverUrl = import.meta.env.VITE_SERVER_URL

  // Fetch the user's roles for all domains
  const fetchPermissions = async () => {
    if (!serverUrl) return
    try {
      const username = localStorage.getItem('username')
      if (!username) return

      const response = await fetch(`${serverUrl}/auth/domains/${username}`)
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

  // A building belongs to domains. If I am 'admin' or 'owner' in ANY of them, I can edit.
  const canEdit = (buildingDomains: string[]): boolean => {
    if (!buildingDomains || buildingDomains.length === 0) return false

    return memberships.value.some(
      (m) => buildingDomains.includes(m.domainName) && ['owner', 'admin'].includes(m.role),
    )
  }

  onMounted(() => {
    fetchPermissions()
  })

  return {
    memberships,
    fetchPermissions,
    canEdit,
  }
}
