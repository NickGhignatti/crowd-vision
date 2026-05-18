<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TableHeader } from '@/models/table.ts'
import { headerId } from '@/utils/metrics.ts'

defineProps<{
  headers: TableHeader[]
  isEditMode: boolean
  activeHeaderKey: string | null
}>()

const emit = defineEmits<{
  'column-click': [header: TableHeader, event: MouseEvent]
  'delete-column': [header: TableHeader]
  'add-new': []
}>()

const { t } = useI18n()
</script>

<template>
  <thead class="bg-emerald-600 text-white sticky top-0 z-10 shadow-sm">
    <tr>
      <th
        v-for="header in headers"
        :key="headerId(header)"
        class="font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0 whitespace-nowrap p-5 relative select-none"
        :class="[
          isEditMode ? 'cursor-pointer hover:bg-emerald-700 transition-colors' : '',
          activeHeaderKey === headerId(header) ? 'bg-emerald-700' : '',
        ]"
        @click="isEditMode ? emit('column-click', header, $event) : undefined"
      >
        <div class="flex items-center gap-1.5 h-full" :class="isEditMode ? 'pr-5' : ''">
          <span>{{ t(header.label) }}</span>
          <i
            v-if="isEditMode"
            class="ph-bold ph-caret-down text-emerald-300 text-[10px] transition-transform duration-150"
            :class="activeHeaderKey === headerId(header) ? 'rotate-180 text-white' : ''"
          ></i>
        </div>

        <button
          v-if="isEditMode"
          @click.stop="emit('delete-column', header)"
          :title="t('dashboard.table.removeColumn')"
          class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500/70 hover:bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-all shadow-sm z-20"
        >
          <i class="ph-bold ph-x text-[9px] leading-none"></i>
        </button>
      </th>

      <th
        v-if="isEditMode"
        @click="emit('add-new')"
        :title="t('dashboard.table.addColumn')"
        class="w-14 border-l border-emerald-500 cursor-pointer hover:bg-emerald-700 transition-colors"
      >
        <div class="flex items-center justify-center h-full p-4">
          <i class="ph-bold ph-plus text-emerald-200 text-base transition-transform duration-200"></i>
        </div>
      </th>
    </tr>
  </thead>
</template>
