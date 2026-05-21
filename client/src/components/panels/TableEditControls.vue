<script setup lang="ts">
defineProps<{
  canEdit?: boolean
  isEditMode?: boolean
  isSaving?: boolean
}>()

defineEmits<{
  'toggle-edit': []
  'add-new': []
  'save': []
  'cancel': []
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start whitespace-nowrap">
    <template v-if="canEdit">
      <template v-if="!isEditMode">
        <button @click="$emit('toggle-edit')"
          class="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border bg-white text-slate-600 border-slate-300 hover:bg-slate-100 leading-tight">
          <i class="ph ph-pencil-simple text-lg leading-none"></i>
          <span class="hidden sm:inline">Edit Columns</span>
        </button>
      </template>
      <template v-else>
        <button @click="$emit('save')" :disabled="isSaving"
          class="px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2 border leading-tight transition-all bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-600/20">
          <i class="text-lg leading-none"
            :class="isSaving ? 'ph-bold ph-spinner animate-spin' : 'ph-bold ph-floppy-disk'"></i>
          <span class="hidden sm:inline">{{ isSaving ? 'Saving…' : 'Save' }}</span>
        </button>
        <button @click="$emit('add-new')" :disabled="isSaving"
          class="px-3 py-2 text-sm font-medium bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors flex items-center gap-2 leading-tight disabled:opacity-50 disabled:cursor-not-allowed">
          <i class="ph-bold ph-plus text-lg leading-none"></i>
          <span class="hidden sm:inline">Add Column</span>
        </button>
        <button @click="$emit('cancel')" :disabled="isSaving"
          class="px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2 border leading-tight transition-colors bg-white text-slate-500 border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed">
          <i class="ph-bold ph-arrow-counter-clockwise text-lg leading-none"></i>
          <span class="hidden sm:inline">Cancel</span>
        </button>
      </template>
    </template>
  </div>
</template>