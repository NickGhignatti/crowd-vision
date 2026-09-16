<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import type { ApiDataPoint } from '@/composables/building/useBuildingHistory.ts'
import { useChartTheme } from '@/composables/ui/useChartTheme.ts'
import {
  alignToTimeline,
  timelineFor,
  timelineLabel,
  type Aggregation,
  type TimeRange,
} from '@/utils/charts.ts'
import SurfaceCard from '@/components/commons/base/SurfaceCard.vue'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler)

const props = defineProps<{
  title: string
  icon: string
  /** Theme variable the series is drawn in, e.g. `--cv-primary`. */
  colorVar: string
  points: ApiDataPoint[]
  loading: boolean
  hasBuilding: boolean
  range: TimeRange
  aggregation: Aggregation
}>()

const { t, locale } = useI18n()
const { options, color } = useChartTheme()

const data = computed(() => {
  const timeline = timelineFor(props.range)
  const stroke = color(props.colorVar)
  return {
    labels: timeline.map((date) => timelineLabel(date, props.range, locale.value)),
    datasets: [
      {
        label: props.title,
        data: alignToTimeline(props.points, timeline),
        borderColor: stroke,
        backgroundColor: `${stroke}1f`,
        fill: true,
      },
    ],
  }
})
</script>

<template>
  <SurfaceCard :title="title" :icon="icon">
    <template #actions>
      <BaseBadge size="sm" shape="square">{{ aggregation }} · {{ range }}</BaseBadge>
    </template>

    <div class="h-72">
      <EmptyState v-if="!hasBuilding" icon="buildings" :title="t('dashboard.table.noData')" />
      <div
        v-else-if="loading"
        class="h-full w-full animate-pulse rounded-lg bg-surface-container"
      />
      <Line v-else :data="data" :options="options" />
    </div>
  </SurfaceCard>
</template>
