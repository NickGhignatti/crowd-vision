import { ref, onMounted } from 'vue'

export function useUserPermissions() {
  const isAllowed = ref(false)
  const serverUrl = import.meta.env.VITE_SERVER_URL

  const checkPermissions = async () => {
    if (!serverUrl) return
    try {
      const username = localStorage.getItem('username')
      if (!username) return

      const response = await fetch(`${serverUrl}/auth/domain/level/${username}`)
      const data = await response.json()
      isAllowed.value = data.domainLevel === 1
    } catch (e) {
      isAllowed.value = false
    }
  }

  onMounted(() => {
    checkPermissions()
  })

  return { isAllowed, checkPermissions }
}
