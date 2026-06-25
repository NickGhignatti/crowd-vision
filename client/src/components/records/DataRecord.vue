<script setup lang="ts">
import MetricCell from '@/components/tables/MetricCell.vue'
import type { TableHeader, TableBody } from '@/models/table.ts'

defineProps<{
  item: TableBody
  headers: TableHeader[]
}>()
</script>

<template>
  <tr class="hover:bg-slate-50 transition-colors duration-150">
    <td
      v-for="header in headers"
      :key="header.key"
      class="p-5 border-r border-slate-200 last:border-r-0"
      :class="header.cellClass"
    >
      <slot :name="header.key" :item="item" :value="item[header.key]">
        <MetricCell :metric-key="header.metricKey" :value="item[header.key]" :row="item" />
      </slot>
    </td>
  </tr>
</template>
