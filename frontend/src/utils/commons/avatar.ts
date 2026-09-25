/** Two capital letters for an account: word initials, else the first two characters. */
export function initialsOf(name?: string, email?: string): string {
  const source = name?.trim() || email?.trim() || ''
  if (!source) return '?'
  const words = source.split(/\s+/)
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : source.slice(0, 2)
  return letters.toUpperCase()
}

/** A stable palette slot per account, so an avatar keeps its colour across renders. */
export function toneIndexOf(source: string, size: number): number {
  let hash = 0
  for (const char of source) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % size
}
