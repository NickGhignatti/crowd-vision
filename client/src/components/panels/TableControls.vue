<script setup lang="ts">
import TableEditControls from './TableEditControls.vue'
import PaginationControls from './PaginationControls.vue'

defineProps<{
  // Pagination
  currentPage: number
  totalPages: number
  isAutoPlaying: boolean

  // Edit
  canEdit?: boolean
  isEditMode?: boolean
  isSaving?: boolean
}>()

defineEmits<{
  // Pagination
  'toggle-auto-play': []
  'prev-page': []
  'next-page': []

  // Edit
  'toggle-edit': []
  'add-new': []
  'save': []
  'cancel': []
}>()
</script>

<template>
  <div
    class="bg-slate-50 p-4 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-4"
  >
    <TableEditControls
      :can-edit="canEdit"
      :is-edit-mode="isEditMode"
      :is-saving="isSaving"
      @toggle-edit="$emit('toggle-edit')"
      @add-new="$emit('add-new')"
      @save="$emit('save')"
      @cancel="$emit('cancel')"
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