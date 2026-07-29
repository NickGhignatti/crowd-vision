<script setup lang="ts">
import { computed } from 'vue'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

// Value + a threshold-coloured Phosphor icon (e.g. a thermometer that warms up).
const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const num = computed(() => parseFloat(String(props.value)))
const color = computed(() =>
  Number.isNaN(num.value) ? 'inherit' : (props.display.color?.(num.value, props.row) ?? 'inherit'),
)
const text = computed(() =>
  Number.isNaN(num.value) ? String(props.value) : `${num.value}${props.display.unit ?? ''}`,
)
</script>

<template>
  <div class="flex items-center gap-2">
    <i v-if="display.icon" :class="['ph-bold', display.icon]" :style="{ color }"></i>
    <span class="font-medium" :style="{ color }">{{ text }}</span>
  </div>
</template>
