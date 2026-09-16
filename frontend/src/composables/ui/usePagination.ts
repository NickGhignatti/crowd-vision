import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { clampPage, pageCount } from '@/utils/pagination.ts'

export function usePagination<T>(items: Ref<T[]>, itemsPerPage: Ref<number>) {
  const currentPage = ref(1)

  const totalPages = computed(() => pageCount(items.value.length, itemsPerPage.value))

  // A filter or a bigger page size can leave the current page past the end.
  watch(totalPages, (pages) => (currentPage.value = clampPage(currentPage.value, pages)))

  const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value
    return items.value.slice(start, start + itemsPerPage.value)
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

  return { currentPage, totalPages, paginatedItems, nextPage, prevPage, goToFirst }
}
