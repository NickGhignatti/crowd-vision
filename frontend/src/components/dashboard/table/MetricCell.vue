<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  METRIC_DISPLAY,
  type MetricDisplay,
  type Renderer,
} from '@/utils/dashboard/metricDisplay.ts'
import type { TableBody } from '@/types/dashboard/table.ts'
import PlainValue from '@/components/dashboard/table/cells/PlainValue.vue'
import RoomName from '@/components/dashboard/table/cells/RoomName.vue'
import MetricBar from '@/components/dashboard/table/cells/MetricBar.vue'
import MetricGauge from '@/components/dashboard/table/cells/MetricGauge.vue'
import StatusPill from '@/components/dashboard/table/cells/StatusPill.vue'

// Unknown metrics fall back to plain text, so a new sensor never breaks the table.
const props = defineProps<{ metricKey?: string; value: unknown; row: TableBody }>()

const RENDERERS: Record<Renderer, Component> = {
  text: PlainValue,
  room: RoomName,
  bar: MetricBar,
  gauge: MetricGauge,
  pill: StatusPill,
}

const display = computed<MetricDisplay>(
  () => (props.metricKey && METRIC_DISPLAY[props.metricKey]) || { renderer: 'text' },
)
</script>

<template>
  <component :is="RENDERERS[display.renderer]" :display="display" :value="value" :row="row" />
</template>
