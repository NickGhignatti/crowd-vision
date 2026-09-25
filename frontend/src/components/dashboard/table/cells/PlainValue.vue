<script setup lang="ts">
import type { MetricDisplay } from '@/utils/dashboard/metricDisplay.ts'
import type { TableBody } from '@/types/dashboard/table.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-mono-metric text-on-surface">
    <BaseIcon v-if="display.icon" :name="display.icon" class="text-base text-on-surface-variant" />
    {{ display.format ? display.format(value) : value }}
  </span>
</template>
