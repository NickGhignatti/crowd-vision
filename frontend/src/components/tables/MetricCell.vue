<script setup lang="ts">
import { computed } from 'vue'
import { METRIC_DISPLAY, type MetricDisplay, type Renderer } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'
import PlainValue from '@/components/tables/cells/PlainValue.vue'
import MetricBar from '@/components/tables/cells/MetricBar.vue'
import MetricGauge from '@/components/tables/cells/MetricGauge.vue'
import StatusPill from '@/components/tables/cells/StatusPill.vue'

// Looks up the metric's display descriptor and renders the matching cell.
// Unknown metrics fall back to plain text, so new sensors never crash the table.
const props = defineProps<{ metricKey?: string; value: unknown; row: TableBody }>()

const RENDERERS = { text: PlainValue, bar: MetricBar, gauge: MetricGauge, pill: StatusPill }

const display = computed<MetricDisplay>(
  () => (props.metricKey && METRIC_DISPLAY[props.metricKey]) || { renderer: 'text' },
)
const component = computed(() => RENDERERS[display.value.renderer as Renderer])
</script>

<template>
  <component :is="component" :display="display" :value="value" :row="row" />
</template>
