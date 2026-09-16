import { describe, expect, it } from 'vitest'
import { parseTheme, resolveTheme } from './theme.ts'

describe('which theme the app paints', () => {
  it('follows the system when the user picked nothing', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('follows the user over the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('reading the stored theme choice', () => {
  it('keeps a known choice', () => {
    expect(parseTheme('dark')).toBe('dark')
  })

  it('treats anything else as system', () => {
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('neon')).toBe('system')
  })
})
