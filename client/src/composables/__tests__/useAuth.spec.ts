import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from '../useAuth'
import { useAuthStore } from '@/stores/authentication'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
    const authStore = useAuthStore()
    authStore.$reset()
  })

  describe('isLoggedIn', () => {
    it('is true when auth store is authenticated', () => {
      const authStore = useAuthStore()
      authStore.isAuthenticated = true
      const { isLoggedIn } = useAuth()

      expect(isLoggedIn.value).toBe(true)
    })

    it('is false when auth store is not authenticated', () => {
      const { isLoggedIn } = useAuth()

      expect(isLoggedIn.value).toBe(false)
    })

    it('reacts when auth store state changes', () => {
      const authStore = useAuthStore()
      const { isLoggedIn } = useAuth()

      authStore.isAuthenticated = true
      expect(isLoggedIn.value).toBe(true)

      authStore.isAuthenticated = false
      expect(isLoggedIn.value).toBe(false)
    })
  })

  describe('handleLogout', () => {
    it('clears auth store state and redirects to home', async () => {
      const authStore = useAuthStore()
      authStore.isAuthenticated = true
      authStore.accountName = 'john'

      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)

      const { isLoggedIn, handleLogout } = useAuth()
      await handleLogout()

      expect(isLoggedIn.value).toBe(false)
      expect(authStore.isAuthenticated).toBe(false)
      expect(authStore.accountName).toBeNull()
      expect(mockPush).toHaveBeenCalledWith('/')
    })

    it('calls logout endpoint through authenticated fetch', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)
      const { handleLogout } = useAuth()

      await handleLogout()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
