export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export const parseTheme = (stored: string | null): ThemePreference =>
  stored === 'light' || stored === 'dark' ? stored : 'system'

export const resolveTheme = (preference: ThemePreference, systemPrefersDark: boolean): Theme =>
  preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference
