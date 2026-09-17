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

describe('the depth fade render style settings', () => {
  const depth = renderStyleConfig('depth')

  it('fades rooms nearer than the building centre and keeps the far side solid', () => {
    expect(depth.room).toMatchObject({ near: 0, far: 1, nearOpacity: 0.04, farOpacity: 0.6 })
  })

  it('keeps the selected room at one steady opacity, whatever its distance', () => {
    expect(depth.selected.nearOpacity).toBe(depth.selected.farOpacity)
    expect(depth.selected.edgeStrength).toBeGreaterThan(depth.room.edgeStrength)
  })

  it('tints rooms with no reading like the ghost style', () => {
    expect(depth.idleColor).toEqual(renderStyleConfig('ghost').idleColor)
  })
})
