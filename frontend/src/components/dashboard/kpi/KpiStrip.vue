<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { aqiBand, type BuildingSummary } from '@/utils/dashboard/dashboard.ts'
import type { ConnectedDevices } from '@/utils/dashboard/connectedDevices.ts'
import KpiCard from '@/components/dashboard/kpi/KpiCard.vue'
import ProgressBar from '@/components/commons/base/ProgressBar.vue'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'
import type { Tone } from '@/utils/commons/tone.ts'

const props = defineProps<{
  summary: BuildingSummary
  loading: boolean
  devices: ConnectedDevices | null
  devicesStale: boolean
  devicesLoading: boolean
}>()

const { t, n } = useI18n()

const EMPTY = '—'
const BAND_TONE: Record<string, Tone> = { good: 'success', moderate: 'warning', poor: 'danger' }

const occupancy = computed(() =>
  props.summary.occupancy === null ? EMPTY : n(props.summary.occupancy, 'percent'),
)
const band = computed(() => aqiBand(props.summary.averageAqi))
const devicesCaption = computed(() => {
  if (props.devices === null) return t('dashboard.kpi.noReading')
  return props.devicesStale ? t('dashboard.kpi.devicesStale') : t('dashboard.kpi.devicesCaption')
})
</script>

<template>
  <section class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
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
      :label="t('dashboard.kpi.devices')"
      icon="wifi-high"
      :value="devices === null ? EMPTY : n(devices.totalDeviceCount)"
      :caption="devicesCaption"
      :alert="devicesStale"
      :loading="devicesLoading"
    />

    <KpiCard
      :label="t('dashboard.kpi.alerts')"
      icon="warning-octagon"
      :value="String(summary.alerts)"
      :alert="summary.alerts > 0"
      :caption="summary.alerts > 0 ? t('dashboard.kpi.alertsCaption') : t('dashboard.kpi.allClear')"
      :loading="loading"
    />
  </section>
</template>
