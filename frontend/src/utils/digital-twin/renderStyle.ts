export const RENDER_STYLE_IDS = ['ghost', 'depth'] as const
export type RenderStyleId = (typeof RENDER_STYLE_IDS)[number]

export const RENDER_STYLE_STORAGE_KEY = 'renderStyle'

/** The saved style, or `ghost` when nothing is saved or the saved one no longer exists. */
export const parseRenderStyle = (stored: string | null): RenderStyleId =>
  RENDER_STYLE_IDS.find((id) => id === stored) ?? 'ghost'

export const nextRenderStyle = (id: RenderStyleId): RenderStyleId =>
  RENDER_STYLE_IDS[(RENDER_STYLE_IDS.indexOf(id) + 1) % RENDER_STYLE_IDS.length]!
