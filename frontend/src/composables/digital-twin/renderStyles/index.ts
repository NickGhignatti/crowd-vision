import type { RenderStyleId } from '@/utils/digital-twin/renderStyle.ts'
import { depthFade } from './depthFade.ts'
import { ghostShell } from './ghostShell.ts'
import type { RenderStyle } from './types.ts'

export const RENDER_STYLES: Record<RenderStyleId, RenderStyle> = {
  ghost: ghostShell,
  depth: depthFade,
}
