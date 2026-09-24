import type { Theme } from '@/utils/commons/theme.ts'
import type { RenderStyleId } from '@/utils/digital-twin/renderStyle.ts'
import { createMaterialCache } from '@/utils/digital-twin/materialCache.ts'
import { RENDER_STYLES } from './renderStyles/index.ts'
import type { RoomMaterial } from './renderStyles/types.ts'

/**
 * The selected room's material per style and theme, shared by every selection: the overlay
 * remounts on each one, and a material made per mount compiled its pipeline per mount.
 * `BuildingScene` clears it when the scene goes away.
 */
export const selectedRoomMaterials = createMaterialCache<RoomMaterial>((key) => {
  const [style, theme] = key.split(':') as [RenderStyleId, Theme]
  return RENDER_STYLES[style].material('selected', theme)
})

export const materialKey = (style: RenderStyleId, theme: Theme) => `${style}:${theme}`
