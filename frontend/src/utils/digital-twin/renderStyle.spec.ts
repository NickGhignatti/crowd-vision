import { describe, expect, it } from 'vitest'
import { RENDER_STYLE_STORAGE_KEY, parseRenderStyle } from './renderStyle.ts'

describe('the render style a browser remembers', () => {
  it('is the saved one when it still exists', () => {
    expect(parseRenderStyle('ghost')).toBe('ghost')
  })

  it.each([null, '', 'retired-style'])('falls back to ghost for %j', (stored) => {
    expect(parseRenderStyle(stored)).toBe('ghost')
  })

  it('lives under its own storage key', () => {
    expect(RENDER_STYLE_STORAGE_KEY).toBe('renderStyle')
  })
})
