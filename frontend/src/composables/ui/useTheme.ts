import { computed, ref, watchEffect } from 'vue'
import { parseTheme, resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from '@/utils/theme.ts'

const readStored = (): string | null => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

const preference = ref<ThemePreference>(parseTheme(readStored()))
const systemPrefersDark = ref(false)
const theme = computed(() => resolveTheme(preference.value, systemPrefersDark.value))

let started = false

/** Tracks the system scheme and keeps `.dark` on <html> in step; safe to call more than once. */
export function startTheme() {
  if (started) return
  started = true
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = media.matches
  media.addEventListener('change', (event) => (systemPrefersDark.value = event.matches))
  watchEffect(() => document.documentElement.classList.toggle('dark', theme.value === 'dark'))
}

export function useTheme() {
  const toggle = () => {
    preference.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference.value)
    } catch {
      // Private mode: the choice still holds for this tab.
    }
  }

  return { theme, preference, toggle }
}
