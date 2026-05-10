import { ref, computed } from 'vue'
import type { Ref } from 'vue'

export function usePagination<T>(items: Ref<T[]>, itemsPerPage: Ref<number>) {
  const currentPage = ref(1)

  const totalPages = computed(() => Math.ceil(items.value.length / itemsPerPage.value))

  const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value
    return items.value.slice(start, start + itemsPerPage.value)
  })

  const emptyRows = computed(() => {
    const length = paginatedItems.value.length
    if (length === 0) return 0
    return Math.max(0, itemsPerPage.value - length)
  })

  const nextPage = () => {
    if (currentPage.value < totalPages.value) currentPage.value++
  }

  const prevPage = () => {
    if (currentPage.value > 1) currentPage.value--
  }

  const goToFirst = () => {
    currentPage.value = 1
  }

  return { currentPage, totalPages, paginatedItems, emptyRows, nextPage, prevPage, goToFirst }
}
