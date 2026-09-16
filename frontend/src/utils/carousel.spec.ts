import { describe, expect, it } from 'vitest'
import { slotOf, step } from './carousel.ts'

describe('where a card sits in the feature carousel', () => {
  it('puts the current card in front', () => {
    expect(slotOf(2, 2, 5)).toBe('current')
  })

  it('puts its neighbours either side, wrapping at the ends', () => {
    expect(slotOf(0, 4, 5)).toBe('next')
    expect(slotOf(4, 0, 5)).toBe('previous')
  })

  it('hides every other card', () => {
    expect(slotOf(2, 0, 5)).toBe('hidden')
  })
})

describe('moving the carousel', () => {
  it('wraps forward past the last card', () => {
    expect(step(4, 1, 5)).toBe(0)
  })

  it('wraps backward past the first card', () => {
    expect(step(0, -1, 5)).toBe(4)
  })
})
