<script setup lang="ts">
import { computed } from 'vue'
import type { MetricDisplay } from '@/utils/dashboard/metricDisplay.ts'
import type { TableBody } from '@/types/dashboard/table.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const num = computed(() => parseFloat(String(props.value)))
const hasValue = computed(() => !Number.isNaN(num.value))
const color = computed(() =>
  hasValue.value ? props.display.color?.(num.value, props.row) : undefined,
)
</script>

<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
    <BaseIcon
      v-if="display.icon"
      :name="display.icon"
      class="text-lg"
      :class="!color && 'text-outline'"
      :style="{ color }"
    />
    <span v-if="hasValue" class="text-mono-metric text-on-surface">
      {{ num }}<span class="text-label-stat text-on-surface-variant">{{ display.unit }}</span>
    </span>
    <span v-else class="text-on-surface-variant">{{ value }}</span>
  </span>
</template>
