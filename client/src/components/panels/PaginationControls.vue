<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  currentPage: number
  totalPages: number
  isAutoPlaying: boolean
}>()

defineEmits<{
  'toggle-auto-play': []
  'prev-page': []
  'next-page': []
}>()
</script>

<template>
  <div
    class="bg-slate-50 p-4 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-4"
  >
    <span class="text-sm text-slate-600 font-medium">
      {{ t('dashboard.table.startIndex') }}
      <span class="text-emerald-700 font-bold">{{ currentPage }}</span>
      {{ t('dashboard.table.ofIndex') }}
      {{ Math.max(totalPages, 1) }}
    </span>

    <div class="flex items-center gap-2">
      <button
        @click="$emit('toggle-auto-play')"
        class="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2 mr-2"
        :class="
          isAutoPlaying
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
        "
      >
        <span v-if="isAutoPlaying" class="relative flex h-2 w-2">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
          ></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        {{ isAutoPlaying ? t('dashboard.table.buttons.stop') : t('dashboard.table.buttons.start') }}
      </button>

      <button
        @click="$emit('prev-page')"
        :disabled="currentPage === 1"
        class="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {{ t('dashboard.table.buttons.previous') }}
      </button>

      <button
        @click="$emit('next-page')"
        :disabled="currentPage === totalPages && !isAutoPlaying"
        class="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {{ t('dashboard.table.buttons.next') }}
      </button>
    </div>
  </div>
</template>
