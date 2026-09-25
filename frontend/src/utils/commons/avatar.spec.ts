import { describe, expect, it } from 'vitest'
import { initialsOf, toneIndexOf } from './avatar.ts'

describe('the initials on an avatar', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Nicolò Ghignatti')).toBe('NG')
  })

  it('takes the first two letters of a single word', () => {
    expect(initialsOf('', 'nick@example.com')).toBe('NI')
  })

  it('falls back to a question mark when nothing is known', () => {
    expect(initialsOf(' ', undefined)).toBe('?')
  })
})

describe('the colour of an avatar', () => {
  it('is the same every time for the same account', () => {
    expect(toneIndexOf('nick', 6)).toBe(toneIndexOf('nick', 6))
  })

  it('stays inside the palette', () => {
    for (const name of ['a', 'bob', 'Nicolò Ghignatti', '']) {
      const index = toneIndexOf(name, 6)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(6)
    }
  })
})
