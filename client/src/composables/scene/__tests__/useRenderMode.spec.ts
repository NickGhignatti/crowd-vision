import { describe, it, expect } from 'vitest'
import { selectRenderMode } from '../useRenderMode'

describe('selectRenderMode', () => {
  it('forces continuous rendering while auto-rotating, since the camera loop only ticks on an actual render', () => {
    expect(selectRenderMode(true)).toBe('always')
  })

  it('renders on-demand once auto-rotate stops, to avoid an idle render loop', () => {
    expect(selectRenderMode(false)).toBe('on-demand')
  })
})
