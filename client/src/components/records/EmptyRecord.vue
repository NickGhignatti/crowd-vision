<script setup lang="ts">
import type { TableHeader } from '@/components/tables/BuildingTable.vue'

defineProps<{
  count: number
  headers: TableHeader[]
}>()
</script>

<template>
  <tr
    v-for="n in count"
    :key="'empty-' + n"
    class="hover:bg-slate-50 transition-colors duration-150"
  >
    <td
      v-for="header in headers"
      :key="header.key"
      class="p-5 border-r border-slate-200 last:border-r-0"
      :class="header.cellClass"
    >
      &nbsp;
    </td>
  </tr>
</template>
