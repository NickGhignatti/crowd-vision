import type { Color, Material } from 'three'
import type { EdgeMask } from './nodes.ts'
import type { Theme } from '@/utils/commons/theme.ts'
import type { RenderStyleId } from '@/utils/digital-twin/renderStyle.ts'

export type RoomRole = 'room' | 'selected'

// The selected room tints its material directly; instanced rooms tint per instance.
export type RoomMaterial = Material & { color: Color }

/**
 * How the scene draws rooms; each call returns a fresh material the caller must dispose.
 * `edges` masks the instanced unit boxes' shared edges (`edgeGlow`).
 */
export interface RenderStyle {
  id: RenderStyleId
  material(role: RoomRole, theme: Theme, edges?: EdgeMask): RoomMaterial
}
