export const RENDER_STYLE_IDS = ['ghost'] as const
export type RenderStyleId = (typeof RENDER_STYLE_IDS)[number]

export const RENDER_STYLE_STORAGE_KEY = 'renderStyle'

/** The saved style, or `ghost` when nothing is saved or the saved one no longer exists. */
export const parseRenderStyle = (stored: string | null): RenderStyleId =>
  RENDER_STYLE_IDS.find((id) => id === stored) ?? 'ghost'
