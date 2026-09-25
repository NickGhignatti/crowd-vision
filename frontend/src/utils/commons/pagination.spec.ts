import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, pageRange, pageWindow } from './pagination.ts'

describe('the page buttons under a table', () => {
  it('lists every page when they all fit', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps first and last page and folds the rest into gaps', () => {
    expect(pageWindow(8, 16)).toEqual([1, 'gap', 7, 8, 9, 'gap', 16])
  })

  it('does not fold a single page into a gap', () => {
    expect(pageWindow(3, 16)).toEqual([1, 2, 3, 4, 'gap', 16])
  })

  it('shows one page when the table is empty', () => {
    expect(pageWindow(1, 0)).toEqual([1])
  })
})

describe('the "showing x to y of z" summary', () => {
  it('spans the rows on the current page', () => {
    expect(pageRange(2, 8, 20)).toEqual({ from: 9, to: 16, total: 20 })
  })

  it('stops at the last row on a short last page', () => {
    expect(pageRange(3, 8, 20)).toEqual({ from: 17, to: 20, total: 20 })
  })

  it('reads zero to zero when there are no rows', () => {
    expect(pageRange(1, 8, 0)).toEqual({ from: 0, to: 0, total: 0 })
  })
})

describe('keeping the current page valid', () => {
  it('counts at least one page', () => {
    expect(pageCount(0, 8)).toBe(1)
    expect(pageCount(17, 8)).toBe(3)
  })

  it('moves back to the last page when rows disappear', () => {
    expect(clampPage(5, 2)).toBe(2)
  })

  it('never goes below the first page', () => {
    expect(clampPage(0, 3)).toBe(1)
  })
})
