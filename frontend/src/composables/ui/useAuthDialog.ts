import { readonly, ref } from 'vue'

export type AuthDialog = 'login' | 'signup' | 'settings'

// One dialog app-wide: a locked nav link, the navbar and the mobile menu all open the same one.
const active = ref<AuthDialog | null>(null)

export function useAuthDialog() {
  return {
    active: readonly(active),
    open: (dialog: AuthDialog) => (active.value = dialog),
    close: () => (active.value = null),
  }
}
