<script setup lang="ts">
defineProps<{
  canEdit?: boolean
  isEditMode?: boolean
}>()

defineEmits<{
  'toggle-edit': []
  'add-new': []
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start whitespace-nowrap">
    <template v-if="canEdit">
      <button
        @click="$emit('toggle-edit')"
        class="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border leading-tight"
        :class="
          isEditMode
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-inner'
            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
        "
      >
        <i class="ph ph-pencil-simple text-lg leading-none"></i>
        <span class="hidden sm:inline">{{ isEditMode ? 'Editing' : 'Edit' }}</span>
      </button>

      <button
        v-show="isEditMode"
        @click="$emit('add-new')"
        class="px-3 py-2 text-sm font-medium bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 shadow-sm leading-tight"
      >
        <i class="ph ph-plus text-lg leading-none"></i>
        <span class="hidden sm:inline">Add</span>
      </button>
    </template>
  </div>
</template>
