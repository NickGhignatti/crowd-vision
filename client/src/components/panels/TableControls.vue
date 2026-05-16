<script setup lang="ts">
import TableEditControls from './TableEditControls.vue'
import PaginationControls from './PaginationControls.vue'

defineProps<{
  // Pagination Props
  currentPage: number
  totalPages: number
  isAutoPlaying: boolean

  // Edit Props
  canEdit?: boolean
  isEditMode?: boolean
}>()

defineEmits<{
  // Pagination Emits
  'toggle-auto-play': []
  'prev-page': []
  'next-page': []

  // Edit Emits
  'toggle-edit': []
  'add-new': []
}>()
</script>

<template>
  <div
    class="bg-slate-50 p-4 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-4"
  >
    <TableEditControls
      :can-edit="canEdit"
      :is-edit-mode="isEditMode"
      @toggle-edit="$emit('toggle-edit')"
      @add-new="$emit('add-new')"
    />

    <PaginationControls
      :current-page="currentPage"
      :total-pages="totalPages"
      :is-auto-playing="isAutoPlaying"
      @toggle-auto-play="$emit('toggle-auto-play')"
      @prev-page="$emit('prev-page')"
      @next-page="$emit('next-page')"
    />
  </div>
</template>
