<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBuildingHistory } from '@/composables/dashboard/useBuildingHistory.ts'
import {
  AGGREGATIONS,
  TIME_RANGES,
  type Aggregation,
  type TimeRange,
} from '@/utils/dashboard/charts.ts'
import SegmentedControl from '@/components/commons/base/SegmentedControl.vue'
import SimulatorToggle from '@/components/dashboard/charts/SimulatorToggle.vue'
import HistoryChartCard from '@/components/dashboard/charts/HistoryChartCard.vue'

const props = defineProps<{ buildingId?: string }>()

type HistoryMetric = Parameters<typeof getBuildingHistory>[2]

const { t } = useI18n()
const buildingId = toRef(props, 'buildingId')
const range = ref<TimeRange>('1D')
const aggregation = ref<Aggregation>('avg')

const history = (metric: HistoryMetric) =>
  getBuildingHistory(buildingId, range, metric, aggregation)

const SERIES = (
  [
    {
      metric: 'peopleCount',
      key: 'dashboard.charts.occupancy',
      icon: 'users-three',
      colorVar: '--cv-primary',
    },
    {
      metric: 'temperature',
      key: 'dashboard.charts.temperature',
      icon: 'thermometer',
      colorVar: '--cv-warning',
    },
    {
      metric: 'airQuality',
      key: 'dashboard.charts.airQuality',
      icon: 'wind',
      colorVar: '--cv-tertiary',
    },
  ] as const
).map((series) => ({ ...series, ...history(series.metric) }))

// A sum of temperatures means nothing, so only occupancy stays up for 'sum'.
const visibleSeries = computed(() =>
  aggregation.value === 'sum' ? SERIES.filter((s) => s.metric === 'peopleCount') : SERIES,
)

const aggregationOptions = AGGREGATIONS.map((value) => ({ value, label: value.toUpperCase() }))
const rangeOptions = TIME_RANGES.map((value) => ({ value, label: value }))
</script>

<template>
  <div class="space-y-4">
    <div
      class="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="flex flex-wrap items-center gap-3">
        <slot name="leading" />
        <SimulatorToggle :building-id="buildingId" />
      </div>
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-label-header uppercase text-on-surface-variant">
          {{ t('dashboard.charts.aggregation') }}
          <SegmentedControl
            v-model="aggregation"
            size="sm"
            :options="aggregationOptions"
            :label="t('dashboard.charts.aggregation')"
          />
        </label>
        <label class="flex items-center gap-2 text-label-header uppercase text-on-surface-variant">
          {{ t('dashboard.charts.range') }}
          <SegmentedControl
            v-model="range"
            size="sm"
            :options="rangeOptions"
            :label="t('dashboard.charts.range')"
          />
        </label>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <HistoryChartCard
        v-for="(series, index) in visibleSeries"
        :key="series.metric"
        :class="(visibleSeries.length === 1 || index === 0) && 'xl:col-span-2'"
        :title="t(series.key)"
        :icon="series.icon"
        :color-var="series.colorVar"
        :points="series.data.value"
        :loading="series.isLoading.value"
        :has-building="!!buildingId"
        :range="range"
        :aggregation="aggregation"
      />
    </div>
  </div>
</template>
