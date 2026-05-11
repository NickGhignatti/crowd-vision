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
    @click="$emit('click', 'graph')"
    class="relative z-10 px-6 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300 flex items-center gap-2"
    :class="viewMode === 'graph' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'"
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
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
    {{ t('dashboard.mode.graphs') }}
  </button>
</template>
