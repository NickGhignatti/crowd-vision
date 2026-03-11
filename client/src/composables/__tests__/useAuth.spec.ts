import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from '../useAuth'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockReset()
  })

  describe('isLoggedIn', () => {
    it('is true when localStorage has isAuthenticated = true', () => {
      localStorage.setItem('isAuthenticated', 'true')
      const { isLoggedIn } = useAuth()

      expect(isLoggedIn.value).toBe(true)
    })

    it('is false when localStorage does not have isAuthenticated', () => {
      const { isLoggedIn } = useAuth()

      expect(isLoggedIn.value).toBe(false)
    })

    it('is false when isAuthenticated is not "true"', () => {
      localStorage.setItem('isAuthenticated', 'false')
      const { isLoggedIn } = useAuth()

      expect(isLoggedIn.value).toBe(false)
    })
  })

  describe('checkAuth', () => {
    it('updates isLoggedIn to true when localStorage is set', () => {
      const { isLoggedIn, checkAuth } = useAuth()

      localStorage.setItem('isAuthenticated', 'true')
      checkAuth()

      expect(isLoggedIn.value).toBe(true)
    })

    it('updates isLoggedIn to false when localStorage is cleared', () => {
      localStorage.setItem('isAuthenticated', 'true')
      const { isLoggedIn, checkAuth } = useAuth()

      localStorage.removeItem('isAuthenticated')
      checkAuth()

      expect(isLoggedIn.value).toBe(false)
    })
  })

  describe('handleLogout', () => {
    it('clears isAuthenticated from localStorage', () => {
      localStorage.setItem('isAuthenticated', 'true')
      const { handleLogout } = useAuth()

      handleLogout()

      expect(localStorage.getItem('isAuthenticated')).toBeNull()
    })

    it('clears username from localStorage', () => {
      localStorage.setItem('username', 'john')
      const { handleLogout } = useAuth()

      handleLogout()

      expect(localStorage.getItem('username')).toBeNull()
    })

    it('clears token from localStorage', () => {
      localStorage.setItem('token', 'abc123')
      const { handleLogout } = useAuth()

      handleLogout()

      expect(localStorage.getItem('token')).toBeNull()
    })

    it('sets isLoggedIn to false', () => {
      localStorage.setItem('isAuthenticated', 'true')
      const { isLoggedIn, handleLogout } = useAuth()

      handleLogout()

      expect(isLoggedIn.value).toBe(false)
    })

    it('redirects to "/"', () => {
      const { handleLogout } = useAuth()

      handleLogout()

      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })
})
