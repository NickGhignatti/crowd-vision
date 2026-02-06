import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { useUserPermissions } from '../useUserPermissions'
import { defineComponent } from 'vue'

const TestComponent = defineComponent({
  setup() {
    return {
      ...useUserPermissions(),
    }
  },
  template: '<div></div>',
})

describe('useUserPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs() // 2. Clean up env mocks
  })

  it('initializes with isAllowed = false', () => {
    const wrapper = mount(TestComponent)
    expect(wrapper.vm.isAllowed).toBe(false)
  })

  it('sets isAllowed to TRUE if domainLevel is 1', async () => {
    localStorage.setItem('username', 'AdminUser')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ domainLevel: 1 }),
    })

    const wrapper = mount(TestComponent)
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/domain/level/AdminUser'),
    )
    expect(wrapper.vm.isAllowed).toBe(true)
  })

  it('sets isAllowed to FALSE if domainLevel is NOT 1', async () => {
    localStorage.setItem('username', 'RegularUser')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ domainLevel: 2 }),
    })

    const wrapper = mount(TestComponent)
    await flushPromises()

    expect(wrapper.vm.isAllowed).toBe(false)
  })

  it('does nothing if username is missing', async () => {
    const wrapper = mount(TestComponent)
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(wrapper.vm.isAllowed).toBe(false)
  })

  it('handles API errors gracefully (remains false)', async () => {
    localStorage.setItem('username', 'TestUser')
    global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'))

    const wrapper = mount(TestComponent)
    await flushPromises()

    expect(wrapper.vm.isAllowed).toBe(false)
  })
})
