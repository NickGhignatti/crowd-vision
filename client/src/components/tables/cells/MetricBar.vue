<script setup lang="ts">
import { computed } from 'vue'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

// Fill bar for ranged metrics (e.g. occupancy). Width = position within [min,max];
// colour is supplied by the descriptor so it can be %-based or threshold-based.
const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const num = computed(() => parseFloat(String(props.value)))
const bounds = computed(() => props.display.range?.(props.row) ?? { min: 0, max: 0 })

const pct = computed(() => {
  const { min, max } = bounds.value
  if (!(max > min) || Number.isNaN(num.value)) return 0
  return Math.min(100, Math.max(0, ((num.value - min) / (max - min)) * 100))
})

const color = computed(() => props.display.color?.(num.value, props.row) ?? '#3B82F6')
const label = computed(() =>
  Number.isNaN(num.value) ? String(props.value) : `${num.value}/${bounds.value.max}`,
)
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="h-1.5 w-28 rounded-full bg-slate-200 overflow-hidden">
      <div
        class="h-full rounded-full transition-[width] duration-300"
        :style="{ width: pct + '%', backgroundColor: color }"
      ></div>
    </div>
    <span class="text-slate-900 tabular-nums">{{ label }}</span>
  </div>
</template>
