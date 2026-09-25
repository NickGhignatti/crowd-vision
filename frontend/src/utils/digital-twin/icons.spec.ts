import { describe, expect, it } from 'vitest'

import { glyphOf } from './icons.ts'

describe('glyphOf', () => {
  it('reads the character a CSS content string carries', () => {
    expect(glyphOf('""')).toBe('')
    expect(glyphOf("''")).toBe('')
  })

  it('has nothing for a rule that draws no character', () => {
    expect(glyphOf('none')).toBeNull()
    expect(glyphOf('normal')).toBeNull()
    expect(glyphOf('')).toBeNull()
    expect(glyphOf('""')).toBeNull()
  })
})
