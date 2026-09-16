<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableHeader } from '@/models/table.ts'
import { headerId } from '@/utils/metrics.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ headers: TableHeader[]; editing: boolean; activeHeaderKey: string | null }>()

const emit = defineEmits<{
  'column-click': [header: TableHeader, event: MouseEvent]
  'delete-column': [header: TableHeader]
  'add-column': []
  reorder: [from: number, to: number]
}>()

const { t } = useI18n()

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

const onDragStart = (index: number, event: DragEvent) => {
  dragFrom.value = index
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const onDragOver = (index: number, event: DragEvent) => {
  event.preventDefault()
  dragOver.value = index
}

const onDrop = (index: number) => {
  if (dragFrom.value !== null && dragFrom.value !== index) emit('reorder', dragFrom.value, index)
  resetDrag()
}

const resetDrag = () => {
  dragFrom.value = null
  dragOver.value = null
}
</script>

<template>
  <thead class="sticky top-0 z-10">
    <tr class="h-12 text-left text-label-header uppercase text-on-primary">
      <th
        v-for="(header, index) in headers"
        :key="headerId(header)"
        scope="col"
        :draggable="editing"
        class="relative select-none whitespace-nowrap bg-primary px-4 py-3 transition-colors first:rounded-l-xl last:rounded-r-xl"
        :class="[
          editing && 'cursor-pointer hover:bg-primary-container',
          activeHeaderKey === headerId(header) && 'bg-primary-container!',
          dragFrom === index && 'opacity-40',
          dragOver === index && dragFrom !== index && 'shadow-[inset_2px_0_0_var(--cv-on-primary)]',
        ]"
        @click="editing && emit('column-click', header, $event)"
        @dragstart="editing && onDragStart(index, $event)"
        @dragover="editing && onDragOver(index, $event)"
        @drop="editing && onDrop(index)"
        @dragend="resetDrag"
      >
        <span class="inline-flex items-center gap-1.5" :class="editing && 'pr-6'">
          <BaseIcon v-if="editing" name="dots-six-vertical" class="cursor-grab opacity-70" />
          {{ t(header.label) }}
          <BaseIcon
            v-if="editing"
            name="caret-down"
            class="opacity-70 transition-transform"
            :class="activeHeaderKey === headerId(header) && 'rotate-180'"
          />
        </span>
        <button
          v-if="editing"
          type="button"
          class="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-error text-[10px] text-on-error transition-transform hover:scale-110"
          :title="t('dashboard.table.removeColumn')"
          :aria-label="t('dashboard.table.removeColumn')"
          @click.stop="emit('delete-column', header)"
        >
          <BaseIcon name="x" />
        </button>
      </th>

      <th v-if="editing" scope="col" class="w-14 rounded-r-xl bg-primary px-2">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-on-primary/15"
          :title="t('dashboard.table.addColumn')"
          :aria-label="t('dashboard.table.addColumn')"
          @click="emit('add-column')"
        >
          <BaseIcon name="plus" />
        </button>
      </th>
    </tr>
  </thead>
</template>
