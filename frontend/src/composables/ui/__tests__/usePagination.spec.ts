import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePagination } from '../usePagination'

describe('usePagination', () => {
  const createItems = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

  it('initializes with correct default values', () => {
    const items = ref(createItems(15))
    const itemsPerPage = ref(5)
    const { currentPage, totalPages, paginatedItems, emptyRows } = usePagination(items, itemsPerPage)

    expect(currentPage.value).toBe(1)
    expect(totalPages.value).toBe(3)
    expect(paginatedItems.value).toEqual([1, 2, 3, 4, 5])
    expect(emptyRows.value).toBe(0)
  })

  it('navigates to the next page', () => {
    const items = ref(createItems(15))
    const itemsPerPage = ref(5)
    const { currentPage, nextPage, paginatedItems } = usePagination(items, itemsPerPage)

    nextPage()
    expect(currentPage.value).toBe(2)
    expect(paginatedItems.value).toEqual([6, 7, 8, 9, 10])
  })

  it('does not navigate beyond total pages', () => {
    const items = ref(createItems(10))
    const itemsPerPage = ref(5)
    const { currentPage, nextPage } = usePagination(items, itemsPerPage)

    nextPage() // page 2
    nextPage() // should stay at page 2
    expect(currentPage.value).toBe(2)
  })

  it('navigates to the previous page', () => {
    const items = ref(createItems(15))
    const itemsPerPage = ref(5)
    const { currentPage, nextPage, prevPage } = usePagination(items, itemsPerPage)

    nextPage() // page 2
    prevPage() // page 1
    expect(currentPage.value).toBe(1)
  })

  it('does not navigate below page 1', () => {
    const items = ref(createItems(15))
    const itemsPerPage = ref(5)
    const { currentPage, prevPage } = usePagination(items, itemsPerPage)

    prevPage()
    expect(currentPage.value).toBe(1)
  })

  it('goes back to first page', () => {
    const items = ref(createItems(15))
    const itemsPerPage = ref(5)
    const { currentPage, nextPage, goToFirst } = usePagination(items, itemsPerPage)

    nextPage()
    nextPage()
    expect(currentPage.value).toBe(3)

    goToFirst()
    expect(currentPage.value).toBe(1)
  })

  it('calculates empty rows correctly on the last page', () => {
    const items = ref(createItems(8))
    const itemsPerPage = ref(5)
    const { nextPage, emptyRows } = usePagination(items, itemsPerPage)

    expect(emptyRows.value).toBe(0) // Page 1: 5 items, full
    nextPage()
    expect(emptyRows.value).toBe(2) // Page 2: 3 items, 2 empty rows
  })

  it('returns 0 empty rows if items is empty', () => {
    const items = ref([])
    const itemsPerPage = ref(5)
    const { emptyRows } = usePagination(items, itemsPerPage)

    expect(emptyRows.value).toBe(0)
  })

  it('updates totalPages and paginatedItems when items change', () => {
    const items = ref(createItems(5))
    const itemsPerPage = ref(5)
    const { totalPages, paginatedItems } = usePagination(items, itemsPerPage)

    expect(totalPages.value).toBe(1)

    items.value = createItems(12)
    expect(totalPages.value).toBe(3)
    expect(paginatedItems.value).toHaveLength(5)
  })

  it('updates totalPages and paginatedItems when itemsPerPage change', () => {
    const items = ref(createItems(10))
    const itemsPerPage = ref(5)
    const { totalPages, paginatedItems } = usePagination(items, itemsPerPage)

    expect(totalPages.value).toBe(2)
    expect(paginatedItems.value).toHaveLength(5)

    itemsPerPage.value = 3
    expect(totalPages.value).toBe(4)
    expect(paginatedItems.value).toHaveLength(3)
  })
})
