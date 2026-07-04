import { describe, it, expect, vi } from 'vitest'
import { NoToneMapping, SRGBColorSpace } from 'three'
import type { TresRendererSetupContext } from '@tresjs/core'
import { isWebGPUSupported, createWebGPURenderer, SCENE_CLEAR_COLOR } from '../useWebGPURenderer'

vi.mock('three/webgpu', () => {
  class MockWebGPURenderer {
    setClearColor = vi.fn()
    init = vi.fn().mockResolvedValue(undefined)
  }
  return { WebGPURenderer: vi.fn(MockWebGPURenderer) }
})

describe('isWebGPUSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    const nav = { gpu: {} } as unknown as Navigator
    expect(isWebGPUSupported(nav)).toBe(true)
  })

  it('returns false when navigator.gpu is absent', () => {
    const nav = {} as Navigator
    expect(isWebGPUSupported(nav)).toBe(false)
  })

  it('returns false when navigator.gpu is explicitly undefined', () => {
    const nav = { gpu: undefined } as unknown as Navigator
    expect(isWebGPUSupported(nav)).toBe(false)
  })
})

describe('createWebGPURenderer', () => {
  it('constructs a WebGPURenderer using the canvas from the TresJS setup context', async () => {
    const { WebGPURenderer } = await import('three/webgpu')
    const canvas = document.createElement('canvas')
    const ctx = { canvas } as unknown as TresRendererSetupContext

    createWebGPURenderer(ctx)

    expect(WebGPURenderer).toHaveBeenCalledWith(expect.objectContaining({ canvas }))
  })

  it('sets the clear color once the backend is initialized, since setting it before init() resolves gets overwritten by backend setup', async () => {
    const canvas = document.createElement('canvas')
    const ctx = { canvas } as unknown as TresRendererSetupContext

    const renderer = createWebGPURenderer(ctx)
    await vi.waitFor(() => expect(renderer.setClearColor).toHaveBeenCalledWith(SCENE_CLEAR_COLOR, 1))
  })

  it('applies sRGB output with no tone mapping, so the white clear colour and the room colours render exactly as given instead of being remapped to grey', async () => {
    const canvas = document.createElement('canvas')
    const ctx = { canvas } as unknown as TresRendererSetupContext

    const renderer = createWebGPURenderer(ctx)
    await vi.waitFor(() => expect(renderer.outputColorSpace).toBe(SRGBColorSpace))
    expect(renderer.toneMapping).toBe(NoToneMapping)
  })
})
