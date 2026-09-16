export type CarouselSlot = 'current' | 'next' | 'previous' | 'hidden'

/** Where the card at `index` sits when `current` is in front. */
export function slotOf(index: number, current: number, length: number): CarouselSlot {
  const offset = (index - current + length) % length
  if (offset === 0) return 'current'
  if (offset === 1) return 'next'
  if (offset === length - 1) return 'previous'
  return 'hidden'
}

/** The index `delta` cards away from `current`, wrapping at both ends. */
export const step = (current: number, delta: number, length: number): number =>
  (((current + delta) % length) + length) % length
