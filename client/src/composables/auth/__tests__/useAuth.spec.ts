import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useAuth } from '@/composables/auth/useAuth.ts'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
}))

const mockLogout = vi.fn()
const mockIsAuthenticated = ref(false)

vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: vi.fn(() => ({
    logout: mockLogout,
    get isAuthenticated() {
      return mockIsAuthenticated.value
    },
  })),
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated.value = false
  })

  describe('isLoggedIn', () => {
    it('is false when the auth store is not authenticated', () => {
      mockIsAuthenticated.value = false
      const { isLoggedIn } = useAuth()
      expect(isLoggedIn.value).toBe(false)
    })

    it('is true when the auth store is authenticated', () => {
      mockIsAuthenticated.value = true
      const { isLoggedIn } = useAuth()
      expect(isLoggedIn.value).toBe(true)
    })

    it('reacts dynamically to store state changes', () => {
      mockIsAuthenticated.value = false
      const { isLoggedIn } = useAuth()
      expect(isLoggedIn.value).toBe(false)

      mockIsAuthenticated.value = true
      expect(isLoggedIn.value).toBe(true)
    })
  })

  describe('handleLogout', () => {
    it('calls logout on the auth store', async () => {
      const { handleLogout } = useAuth()
      await handleLogout()

      expect(mockLogout).toHaveBeenCalledTimes(1)
    })

    it('pushes the user to the home route ("/") after logging out', async () => {
      const { handleLogout } = useAuth()
      await handleLogout()

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/')
    })

    it('does not route the user if the store logout throws an error', async () => {
      mockLogout.mockRejectedValueOnce(new Error('Network Error'))
      const { handleLogout } = useAuth()

      await expect(handleLogout()).rejects.toThrow('Network Error')
      // Ensure router.push is never called if the logout fails
      expect(mockPush).not.toHaveBeenCalled()
    })
  })
})
