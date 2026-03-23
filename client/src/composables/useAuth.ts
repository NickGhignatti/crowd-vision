import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authentication.ts'

export function useAuth() {
  const authStore = useAuthStore()
  const router = useRouter()

  const handleLogout = async () => {
    await authStore.logout()
    await router.push('/')
  }

  return {
    isLoggedIn: computed(() => authStore.isAuthenticated),
    handleLogout,
  }
}
