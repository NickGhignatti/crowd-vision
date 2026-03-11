import { describe, it, expect, vi } from 'vitest'
import { useNavLinks } from '../useNavLinks'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('useNavLinks', () => {
  it('returns 3 links', () => {
    const { links } = useNavLinks()

    expect(links).toHaveLength(3)
  })

  it('has correct routes', () => {
    const { links } = useNavLinks()

    expect(links[0]?.to).toBe('/dashboard')
    expect(links[1]?.to).toBe('/model')
    expect(links[2]?.to).toBe('/domains')
  })

  it('labels call t() with correct keys', () => {
    const { links } = useNavLinks()

    expect(links[0]?.label()).toBe('commons.dashboard')
    expect(links[1]?.label()).toBe('commons.digitalTwin')
    expect(links[2]?.label()).toBe('commons.domains')
  })
})
