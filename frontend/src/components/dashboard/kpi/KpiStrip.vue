<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { aqiBand, type BuildingSummary } from '@/utils/dashboard.ts'
import KpiCard from '@/components/dashboard/kpi/KpiCard.vue'
import ProgressBar from '@/components/commons/base/ProgressBar.vue'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'
import type { Tone } from '@/helpers/tone.ts'

const props = defineProps<{ summary: BuildingSummary; loading: boolean }>()

const { t, n } = useI18n()

const EMPTY = '—'
const BAND_TONE: Record<string, Tone> = { good: 'success', moderate: 'warning', poor: 'danger' }

const occupancy = computed(() =>
  props.summary.occupancy === null ? EMPTY : n(props.summary.occupancy, 'percent'),
)
const band = computed(() => aqiBand(props.summary.averageAqi))
</script>

<template>
  <section class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
    <KpiCard
      :label="t('dashboard.kpi.rooms')"
      icon="door-open"
      :value="String(summary.rooms)"
      :caption="t('dashboard.kpi.roomsCaption')"
      :loading="loading"
    />

    <KpiCard
      :label="t('dashboard.kpi.temperature')"
      icon="thermometer"
      :value="summary.averageTemperature === null ? EMPTY : String(summary.averageTemperature)"
      :unit="summary.averageTemperature === null ? '' : '°C'"
      :caption="t('dashboard.kpi.averageCaption')"
      :loading="loading"
    />

    <KpiCard
      :label="t('dashboard.kpi.occupancy')"
      icon="users-three"
      :value="occupancy"
      :loading="loading"
    >
      <p class="text-label-stat text-on-surface-variant">
        {{ t('dashboard.kpi.people', { people: summary.people, capacity: summary.capacity }) }}
      </p>
      <ProgressBar class="mt-1" :value="summary.occupancy" :label="t('dashboard.kpi.occupancy')" />
    </KpiCard>

    <KpiCard
      :label="t('dashboard.kpi.airQuality')"
      icon="wind"
      :value="summary.averageAqi === null ? EMPTY : String(summary.averageAqi)"
      :unit="summary.averageAqi === null ? '' : 'AQI'"
      :loading="loading"
    >
      <BaseBadge v-if="band" class="self-start" size="sm" :tone="BAND_TONE[band]">
        {{ t(`dashboard.kpi.aqi.${band}`) }}
      </BaseBadge>
      <p v-else class="text-label-stat text-on-surface-variant">
        {{ t('dashboard.kpi.noReading') }}
      </p>
    </KpiCard>

    <KpiCard
      class="col-span-2 md:col-span-1"
      :label="t('dashboard.kpi.alerts')"
      icon="warning-octagon"
      :value="String(summary.alerts)"
      :alert="summary.alerts > 0"
      :caption="summary.alerts > 0 ? t('dashboard.kpi.alertsCaption') : t('dashboard.kpi.allClear')"
      :loading="loading"
    />
  </section>
</template>
