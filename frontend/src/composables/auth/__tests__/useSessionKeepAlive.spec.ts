import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authentication'
import { useSessionKeepAlive, REFRESH_INTERVAL_MS } from '../useSessionKeepAlive'

const TestComponent = defineComponent({
  setup() {
    useSessionKeepAlive()
    return {}
  },
  template: '<div></div>',
})

describe('useSessionKeepAlive', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const authenticatedStore = () => {
    const store = useAuthStore()
    store.isAuthenticated = true
    vi.spyOn(store, 'refreshSession').mockResolvedValue(undefined)
    return store
  }

  it('re-mints the session once per interval while authenticated', async () => {
    const store = authenticatedStore()
    mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3)

    expect(store.refreshSession).toHaveBeenCalledTimes(3)
  })

  it('does not refresh before the first interval elapses', async () => {
    const store = authenticatedStore()
    mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS - 1)

    expect(store.refreshSession).not.toHaveBeenCalled()
  })

  it('never refreshes while unauthenticated', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'refreshSession').mockResolvedValue(undefined)
    mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3)

    expect(store.refreshSession).not.toHaveBeenCalled()
  })

  it('stops refreshing once the session ends', async () => {
    const store = authenticatedStore()
    mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)
    store.isAuthenticated = false
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3)

    expect(store.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('stops refreshing after the component unmounts', async () => {
    const store = authenticatedStore()
    const wrapper = mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3)

    expect(store.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('keeps refreshing when one attempt fails', async () => {
    const store = useAuthStore()
    store.isAuthenticated = true
    vi.spyOn(store, 'refreshSession')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined)
    mount(TestComponent)

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2)

    expect(store.refreshSession).toHaveBeenCalledTimes(2)
  })
})
