<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  icon: string
  title: string
  isUploading?: boolean
}>()

const emit = defineEmits<{
  (e: 'file-selected', file: File): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const handleChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    emit('file-selected', file)
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <button
    type="button"
    :disabled="isUploading"
    class="w-full flex items-center justify-between gap-4 px-6 py-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-emerald-400 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
    @click="fileInput?.click()"
  >
    <span
      class="text-sm font-bold text-slate-500 group-hover:text-slate-700 transition-colors text-left"
    >
      {{ title }}
    </span>
    <i
      class="ph-bold text-2xl text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0"
      :class="isUploading ? 'ph-spinner animate-spin' : icon"
    ></i>
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleChange" />
  </button>
</template>
