<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  viewMode: string
}>()
defineEmits(['click'])

const { t } = useI18n()
</script>

<template>
  <button
    @click="$emit('click', 'table')"
    class="relative z-10 px-6 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300 flex items-center gap-2"
    :class="viewMode === 'table' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
    {{ t('dashboard.mode.table') }}
  </button>
</template>
