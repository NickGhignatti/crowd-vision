import { describe, expect, it } from 'vitest'
import {
  RENDER_STYLE_IDS,
  RENDER_STYLE_STORAGE_KEY,
  nextRenderStyle,
  parseRenderStyle,
} from './renderStyle.ts'

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

describe('the style the toolbar button switches to', () => {
  it('is the next one in the list, wrapping from the last back to the first', () => {
    const after = RENDER_STYLE_IDS.map((id) => nextRenderStyle(id))
    expect(after).toEqual([...RENDER_STYLE_IDS.slice(1), RENDER_STYLE_IDS[0]])
  })
})
