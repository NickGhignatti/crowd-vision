import { ref } from 'vue'
import { useRouter } from 'vue-router'

export function useAuth() {
  const router = useRouter()

  const isLoggedIn = ref(localStorage.getItem('isAuthenticated') === 'true')

  const checkAuth = () => {
    isLoggedIn.value = localStorage.getItem('isAuthenticated') === 'true'
  }

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('username')
    localStorage.removeItem('token')
    isLoggedIn.value = false
    router.push('/')
  }

  return { isLoggedIn, checkAuth, handleLogout }
}
