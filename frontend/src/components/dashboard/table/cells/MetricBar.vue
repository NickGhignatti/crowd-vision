<script setup lang="ts">
import { computed } from 'vue'
import type { MetricDisplay } from '@/utils/dashboard/metricDisplay.ts'
import type { TableBody } from '@/types/dashboard/table.ts'
import ProgressBar from '@/components/commons/base/ProgressBar.vue'

// Width is the value's position within the row's range; colour comes from the descriptor.
const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const num = computed(() => parseFloat(String(props.value)))
const bounds = computed(() => props.display.range?.(props.row) ?? { min: 0, max: 0 })
const ratio = computed(() => {
  const { min, max } = bounds.value
  return max > min && !Number.isNaN(num.value) ? (num.value - min) / (max - min) : null
})
</script>

<template>
  <span v-if="Number.isNaN(num)" class="text-on-surface-variant">{{ value }}</span>
  <div v-else class="w-44 space-y-1">
    <div class="flex items-center justify-between text-label-stat">
      <span class="text-mono-metric text-on-surface">
        {{ ratio === null ? '—' : `${Math.round(ratio * 100)}%` }}
      </span>
      <span class="tabular-nums text-on-surface-variant">{{ num }} / {{ bounds.max }}</span>
    </div>
    <ProgressBar
      size="md"
      :value="ratio"
      :color="display.color?.(num, row)"
      :label="`${num} / ${bounds.max}`"
    />
  </div>
</template>
