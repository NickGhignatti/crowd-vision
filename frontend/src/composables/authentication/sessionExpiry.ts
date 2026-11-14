import { ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { setUnauthorizedHandler } from '@/composables/commons/useApi.ts'
import { useAuthStore } from '@/stores/authentication/authentication.ts'
import { ROUTES } from '@/router/routes.ts'
import { shouldEndSession } from '@/utils/authentication/session.ts'

// One banner app-wide: the 401 handler raises it, a new session puts it away.
const sessionExpired = ref(false)

export function useSessionExpiry() {
  return {
    sessionExpired,
    dismiss: () => (sessionExpired.value = false),
  }
}

/** Wires the 401 policy: the first refused gated call ends the session and says why. */
export function startSessionExpiry(router: Router) {
  const authStore = useAuthStore()

  setUnauthorizedHandler((path) => {
    if (!shouldEndSession(path, authStore.isAuthenticated)) return

    authStore.clearSession()
    sessionExpired.value = true
    // replace: the protected page cannot be reached any more, so it has no place in history.
    void router.replace(ROUTES.home)
  })

  watch(
    () => authStore.isAuthenticated,
    (authed) => {
      if (authed) sessionExpired.value = false
    },
  )
}
