<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableBody, TableHeader } from '@/types/dashboard/table.ts'
import MetricCell from '@/components/dashboard/table/MetricCell.vue'
import TelemetryTableHead from '@/components/dashboard/table/TelemetryTableHead.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'

export type TableState = 'no-building' | 'loading' | 'ready'

const props = defineProps<{
  headers: TableHeader[]
  rows: TableBody[]
  state: TableState
  editing: boolean
  activeHeaderKey: string | null
}>()

defineEmits<{
  'column-click': [header: TableHeader, event: MouseEvent]
  'delete-column': [header: TableHeader]
  'add-column': []
  reorder: [from: number, to: number]
}>()

const { t } = useI18n()
const SKELETON_ROWS = 5

const colspan = computed(() => props.headers.length + (props.editing ? 1 : 0))
</script>

<template>
  <div class="w-full overflow-x-auto px-2 pt-2">
    <table class="w-full min-w-[720px] border-separate border-spacing-0 text-left">
      <TelemetryTableHead
        :headers="headers"
        :editing="editing"
        :active-header-key="activeHeaderKey"
        @column-click="(header, event) => $emit('column-click', header, event)"
        @delete-column="$emit('delete-column', $event)"
        @add-column="$emit('add-column')"
        @reorder="(from, to) => $emit('reorder', from, to)"
      />

      <tbody class="text-body-md">
        <tr v-if="state === 'no-building'">
          <td :colspan="colspan">
            <EmptyState icon="buildings" :title="t('dashboard.table.noData')" />
          </td>
        </tr>

        <template v-else-if="state === 'loading'">
          <tr v-for="n in SKELETON_ROWS" :key="n" class="h-14">
            <td v-for="header in headers" :key="header.key" class="px-4">
              <div class="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
            </td>
          </tr>
        </template>

        <tr v-else-if="rows.length === 0">
          <td :colspan="colspan">
            <EmptyState icon="funnel-x" :title="t('dashboard.table.noDataAvailable')" />
          </td>
        </tr>

        <template v-else>
          <tr
            v-for="row in rows"
            :key="row.roomId"
            class="group h-14 transition-colors even:bg-surface-container-low hover:bg-surface-container"
          >
            <td
              v-for="header in headers"
              :key="header.key"
              class="px-4 py-2.5 first:rounded-l-xl last:rounded-r-xl"
              :class="header.cellClass"
            >
              <MetricCell :metric-key="header.metricKey" :value="row[header.key]" :row="row" />
            </td>
            <td v-if="editing" />
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
