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

/** Opacity by distance; `near`/`far` are bounding radii past the building centre (0 = centre, 1 = far edge). */
export interface DepthShading {
  near: number
  far: number
  nearOpacity: number
  farOpacity: number
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

export interface DepthConfig extends CommonConfig {
  room: DepthShading
  selected: DepthShading
}

interface RenderStyleConfigs {
  ghost: GhostConfig
  depth: DepthConfig
}

const IDLE_COLOR = { light: '#64748b', dark: '#e2e8f0' }

const CONFIGS: RenderStyleConfigs = {
  ghost: {
    idleColor: IDLE_COLOR,
    room: { base: 0.04, strength: 0.45, power: 2, edgeWidth: 4, edgeStrength: 0.5 },
    selected: { base: 0.12, strength: 0.6, power: 2, edgeWidth: 5, edgeStrength: 0.8 },
  },
  depth: {
    idleColor: IDLE_COLOR,
    room: {
      near: 0,
      far: 1,
      nearOpacity: 0.04,
      farOpacity: 0.6,
      edgeWidth: 4,
      edgeStrength: 0.5,
    },
    selected: {
      near: 0,
      far: 1,
      nearOpacity: 0.45,
      farOpacity: 0.45,
      edgeWidth: 5,
      edgeStrength: 0.8,
    },
  },
}

/** The settings a render style draws with. */
export const renderStyleConfig = <Id extends RenderStyleId>(
  id: Id,
): Readonly<RenderStyleConfigs[Id]> => CONFIGS[id]
