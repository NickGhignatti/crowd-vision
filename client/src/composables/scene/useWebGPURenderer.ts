import { toValue } from 'vue'
import { NoToneMapping, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { TresRendererSetupContext } from '@tresjs/core'

/** TresJS's WebGPU renderer prop has no automatic WebGL fallback, so we gate on feature
 * support ourselves and only wire the custom renderer in when the browser exposes the API. */
export function isWebGPUSupported(nav: Navigator = navigator): boolean {
  return 'gpu' in nav && (nav as Navigator & { gpu?: unknown }).gpu !== undefined
}

// Matches ModelView's TresCanvas `clear-color` — kept as a constant because TresCanvas only
// auto-applies that prop to its own default renderer, not a custom one from the `renderer` factory.
export const SCENE_CLEAR_COLOR = '#ffffff'

// Above 2x, the extra fragment cost buys negligible sharpness on flat room boxes.
export const MAX_PIXEL_RATIO = 2

export function clampPixelRatio(dpr: number): number {
  return Math.min(Math.max(dpr, 1), MAX_PIXEL_RATIO)
}

export function createWebGPURenderer(ctx: TresRendererSetupContext) {
  const renderer = new WebGPURenderer({
    canvas: toValue(ctx.canvas),
    antialias: true,
  })
  // Config is set after init() since backend resolution there resets renderer state. No tone
  // mapping: ACES remaps white to ~0.8, greying/desaturating our exact clear + room colors.
  void renderer
    .init()
    .then(() => {
      renderer.setClearColor(SCENE_CLEAR_COLOR, 1)
      renderer.outputColorSpace = SRGBColorSpace
      renderer.toneMapping = NoToneMapping
      renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio ?? 1))
    })
    .catch((err) => console.error('[webgpu] renderer init failed', err))
  return renderer
}
