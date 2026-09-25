import { describe, expect, it, vi } from 'vitest'

import { createMaterialCache } from './materialCache.ts'

const fakeMaterial = (key: string) => ({ key, dispose: vi.fn() })

describe('createMaterialCache', () => {
  it('builds a material once per key and hands back the same one after', () => {
    const build = vi.fn(fakeMaterial)
    const cache = createMaterialCache(build)

    const first = cache.get('ghost:dark')
    expect(cache.get('ghost:dark')).toBe(first)
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('keeps every material alive when switching between keys', () => {
    // Disposing on a switch throws the compiled pipeline away, so switching back recompiles it.
    const cache = createMaterialCache(fakeMaterial)
    const ghost = cache.get('ghost:dark')
    cache.get('depth:dark')

    expect(cache.get('ghost:dark')).toBe(ghost)
    expect(ghost.dispose).not.toHaveBeenCalled()
  })

  it('disposes every material exactly once when cleared, and rebuilds afterwards', () => {
    const build = vi.fn(fakeMaterial)
    const cache = createMaterialCache(build)
    const ghost = cache.get('ghost:dark')
    const depth = cache.get('depth:dark')

    cache.clear()
    expect(ghost.dispose).toHaveBeenCalledTimes(1)
    expect(depth.dispose).toHaveBeenCalledTimes(1)

    expect(cache.get('ghost:dark')).not.toBe(ghost)
    expect(build).toHaveBeenCalledTimes(3)
  })

  it('lists what it holds, so every material can be compiled ahead of first use', () => {
    const cache = createMaterialCache(fakeMaterial)
    cache.get('ghost:dark')
    cache.get('depth:dark')
    expect(cache.all().map((material) => material.key)).toEqual(['ghost:dark', 'depth:dark'])
  })
})
