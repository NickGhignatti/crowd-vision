import type { Theme } from '@/utils/commons/theme.ts'
import type { RenderStyleId } from './renderStyle.ts'

/** Fresnel opacity: `base` where a face looks at the camera, `base + strength` edge-on. */
export interface ShellShading {
  base: number
  strength: number
  power: number
  /** Edge glow falloff, in screen pixels. */
  edgeWidth: number
  edgeStrength: number
}

interface CommonConfig {
  /** Colour of a room with no reading; data colours never change with the theme. */
  idleColor: Record<Theme, string>
}

export interface GhostConfig extends CommonConfig {
  room: ShellShading
  selected: ShellShading
}

interface RenderStyleConfigs {
  ghost: GhostConfig
}

const CONFIGS: RenderStyleConfigs = {
  ghost: {
    idleColor: { light: '#64748b', dark: '#e2e8f0' },
    room: { base: 0.04, strength: 0.45, power: 2, edgeWidth: 4, edgeStrength: 0.5 },
    selected: { base: 0.12, strength: 0.6, power: 2, edgeWidth: 5, edgeStrength: 0.8 },
  },
}

/** The settings a render style draws with. */
export const renderStyleConfig = <Id extends RenderStyleId>(
  id: Id,
): Readonly<RenderStyleConfigs[Id]> => CONFIGS[id]
