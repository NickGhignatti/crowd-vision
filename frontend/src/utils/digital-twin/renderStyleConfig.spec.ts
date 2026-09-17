import { describe, expect, it } from 'vitest'
import { renderStyleConfig } from './renderStyleConfig.ts'

describe('the ghost render style settings', () => {
  const ghost = renderStyleConfig('ghost')

  it('keeps rooms nearly clear face-on, firmer toward the silhouette', () => {
    expect(ghost.room).toMatchObject({ base: 0.04, strength: 0.45, power: 2 })
  })

  it('glows along room edges, a few pixels wide at any zoom', () => {
    expect(ghost.room).toMatchObject({ edgeWidth: 4, edgeStrength: 0.5 })
  })

  it('makes the selected room stand out from the rest', () => {
    expect(ghost.selected.base).toBeGreaterThan(ghost.room.base)
    expect(ghost.selected.strength).toBeGreaterThan(ghost.room.strength)
    expect(ghost.selected.edgeStrength).toBeGreaterThan(ghost.room.edgeStrength)
  })

  it('tints rooms with no reading slate on light, where pale grey has no contrast', () => {
    expect(ghost.idleColor).toEqual({ light: '#64748b', dark: '#e2e8f0' })
  })
})
