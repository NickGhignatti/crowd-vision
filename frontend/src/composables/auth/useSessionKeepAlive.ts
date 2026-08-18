import { onUnmounted, watch } from 'vue'
import { useAuthStore } from '@/stores/authentication'

export const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export function useSessionKeepAlive() {
  const authStore = useAuthStore()
  let timer: ReturnType<typeof setInterval> | undefined

  function stop() {
    if (timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }

  function start() {
    if (timer !== undefined) return
    timer = setInterval(() => {
      authStore.refreshSession().catch(() => {})
    }, REFRESH_INTERVAL_MS)
  }

  watch(() => authStore.isAuthenticated, (authed) => (authed ? start() : stop()), {
    immediate: true,
  })

  onUnmounted(stop)
}
