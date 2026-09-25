export type PageItem = number | 'gap'

/** The page buttons to draw: first, last, and `siblings` either side of the current page. */
export function pageWindow(current: number, total: number, siblings = 1): PageItem[] {
  const last = Math.max(total, 1)
  const pages = new Set([1, last])
  for (let page = current - siblings; page <= current + siblings; page++) {
    if (page >= 1 && page <= last) pages.add(page)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const items: PageItem[] = []
  sorted.forEach((page, i) => {
    const previous = sorted[i - 1]
    // A gap hiding one page costs the same width as the page, so show the page.
    if (previous !== undefined && page - previous === 2) items.push(previous + 1)
    else if (previous !== undefined && page - previous > 2) items.push('gap')
    items.push(page)
  })
  return items
}

/** The 1-based row span shown on a page. */
export function pageRange(page: number, perPage: number, total: number) {
  if (total === 0) return { from: 0, to: 0, total }
  const from = (page - 1) * perPage + 1
  return { from, to: Math.min(page * perPage, total), total }
}

export const pageCount = (total: number, perPage: number): number =>
  Math.max(1, Math.ceil(total / perPage))

export const clampPage = (page: number, pages: number): number =>
  Math.min(Math.max(page, 1), Math.max(pages, 1))
