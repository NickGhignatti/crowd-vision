import { toValue } from 'vue'
import { NoToneMapping, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { TresRendererSetupContext } from '@tresjs/core'

/**
 * TresJS's WebGPU renderer prop has no automatic WebGL fallback if
 * construction fails, so we gate on feature support ourselves and only
 * wire the custom renderer in when the browser actually exposes the API.
 */
export function isWebGPUSupported(nav: Navigator = navigator): boolean {
  return 'gpu' in nav && (nav as Navigator & { gpu?: unknown }).gpu !== undefined
}

// Matches ModelView's TresCanvas `clear-color` — kept as a constant because
// TresCanvas only auto-applies that prop to its own default renderer, not to
// a custom one supplied via the `renderer` factory.
export const SCENE_CLEAR_COLOR = '#ffffff'

export function createWebGPURenderer(ctx: TresRendererSetupContext) {
  const renderer = new WebGPURenderer({
    canvas: toValue(ctx.canvas),
    antialias: true,
  })
  // Backend selection (WebGPU vs. the WebGL2 fallback) resolves asynchronously
  // in init() and resets renderer state, so config set beforehand gets discarded.
  // No tone mapping: ACES (and any filmic curve) remaps pure white to ~0.8, which
  // turned the white background into a grey wash and desaturated the temperature
  // colors. We want the clear colour and the room colours rendered exactly as given.
  void renderer
    .init()
    .then(() => {
      renderer.setClearColor(SCENE_CLEAR_COLOR, 1)
      renderer.outputColorSpace = SRGBColorSpace
      renderer.toneMapping = NoToneMapping
    })
    .catch((err) => console.error('[webgpu] renderer init failed', err))
  return renderer
}
