import { onUnmounted, watch } from 'vue'
import { useAuthStore } from '@/stores/authentication/authentication'
import { nextRefreshDelayMs, REFRESH_INTERVAL_MS } from '@/utils/authentication/session.ts'

export function useSessionKeepAlive() {
  const authStore = useAuthStore()
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  function schedule(delayMs: number) {
    stop()
    timer = setTimeout(async () => {
      const renewed = await authStore.refreshSession().catch(() => false)
      // A 401 already cleared the session, and its watcher stopped this loop.
      if (!authStore.isAuthenticated) return
      schedule(nextRefreshDelayMs(renewed))
    }, delayMs)
  }

  watch(
    () => authStore.isAuthenticated,
    (authed) => (authed ? schedule(REFRESH_INTERVAL_MS) : stop()),
    { immediate: true },
  )

  onUnmounted(stop)
}
