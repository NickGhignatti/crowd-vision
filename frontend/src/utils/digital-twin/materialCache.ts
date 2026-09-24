interface Disposable {
  dispose(): void
}

/**
 * One material per key, kept until the cache is cleared. Disposing a material on every switch
 * throws its compiled GPU pipeline away, so switching back to a style or theme recompiles it.
 */
export function createMaterialCache<M extends Disposable>(build: (key: string) => M) {
  const materials = new Map<string, M>()

  const get = (key: string): M => {
    const existing = materials.get(key)
    if (existing) return existing
    const material = build(key)
    materials.set(key, material)
    return material
  }

  const all = (): M[] => [...materials.values()]

  const clear = (): void => {
    for (const material of materials.values()) material.dispose()
    materials.clear()
  }

  return { get, all, clear }
}
