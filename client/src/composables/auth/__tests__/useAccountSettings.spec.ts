import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAccountSettings } from '@/composables/auth/useAccountSettings.ts'
import { makeRequest } from '@/composables/core/useApi.ts'
import { useAuthStore } from '@/stores/authentication.ts'

vi.mock('@/composables/core/useApi.ts', () => ({
  makeRequest: vi.fn(),
}))

vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: vi.fn(),
}))

const makeResponse = (ok: boolean, status: number, body: unknown = {}) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(body),
})

describe('useAccountSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchProfile', () => {
    it('returns the current email and name on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, 200, { email: 'mario@unibo.it', name: 'Mario Rossi' }) as unknown as Response,
      )

      const { fetchProfile } = useAccountSettings()
      const result = await fetchProfile()

      expect(makeRequest).toHaveBeenCalledWith('/gateway/profile')
      expect(result).toEqual({ ok: true, email: 'mario@unibo.it', name: 'Mario Rossi' })
    })

    it('reports failure without throwing', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, 401) as unknown as Response)

      const { fetchProfile } = useAccountSettings()
      const result = await fetchProfile()

      expect(result).toEqual({ ok: false })
    })
  })

  describe('updateProfile', () => {
    it('patches email/name and hydrates the store on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, 204) as unknown as Response)
      const mockHydrate = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useAuthStore).mockReturnValue({
        hydrate: mockHydrate,
      } as unknown as ReturnType<typeof useAuthStore>)

      const { updateProfile } = useAccountSettings()
      const result = await updateProfile('new@unibo.it', 'Mario Rossi')

      expect(makeRequest).toHaveBeenCalledWith(
        '/gateway/profile',
        'PATCH',
        expect.objectContaining({
          body: JSON.stringify({ email: 'new@unibo.it', name: 'Mario Rossi' }),
        }),
      )
      expect(mockHydrate).toHaveBeenCalledWith(true)
      expect(result).toEqual({ ok: true })
    })

    it('reports an already-registered error on a 409 without hydrating the store', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, 409) as unknown as Response)

      const { updateProfile } = useAccountSettings()
      const result = await updateProfile('taken@unibo.it', '')

      expect(result).toEqual({ ok: false, error: 'emailAlreadyRegistered' })
      expect(useAuthStore).not.toHaveBeenCalled()
    })

    it('reports a generic error for any other failure status', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, 503) as unknown as Response)

      const { updateProfile } = useAccountSettings()
      const result = await updateProfile('new@unibo.it', '')

      expect(result).toEqual({ ok: false, error: 'authErrorGeneric' })
    })
  })

  describe('changePassword', () => {
    it('posts current/new password on success', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true, 204) as unknown as Response)

      const { changePassword } = useAccountSettings()
      const result = await changePassword('old-pass', 'new-pass')

      expect(makeRequest).toHaveBeenCalledWith(
        '/gateway/profile/password',
        'POST',
        expect.objectContaining({
          body: JSON.stringify({ currentPassword: 'old-pass', newPassword: 'new-pass' }),
        }),
      )
      expect(result).toEqual({ ok: true })
    })

    it('reports invalid credentials on a 401', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, 401) as unknown as Response)

      const { changePassword } = useAccountSettings()
      const result = await changePassword('wrong-pass', 'new-pass')

      expect(result).toEqual({ ok: false, error: 'invalidCredentials' })
    })

    it('reports a generic error for any other failure status', async () => {
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(false, 503) as unknown as Response)

      const { changePassword } = useAccountSettings()
      const result = await changePassword('old-pass', 'new-pass')

      expect(result).toEqual({ ok: false, error: 'authErrorGeneric' })
    })
  })
})
