<script setup lang="ts">
import { roomColorByTemperature } from '@/helpers/colors.ts'
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
        <span
          :style="{
            color:
              header.key === 'temp'
                ? roomColorByTemperature(parseFloat(item[header.key]))
                : 'inherit',
          }"
        >
          {{ item[header.key] }}
        </span>
      </slot>
    </td>
  </tr>
</template>
