/**
 * The character an icon font draws, as CSS reports it: `content` comes back quoted, and a rule
 * that draws nothing says `none`, `normal` or an empty string.
 */
export function glyphOf(content: string): string | null {
  const glyph = content.trim().replace(/^["']|["']$/g, '')
  return glyph === '' || glyph === 'none' || glyph === 'normal' ? null : glyph
}
