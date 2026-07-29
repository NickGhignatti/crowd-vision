<script setup lang="ts">
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

// Fallback renderer: plain text/number, with an optional formatter.
const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()
</script>

<template>
  <span>{{ display.format ? display.format(value) : value }}</span>
</template>
