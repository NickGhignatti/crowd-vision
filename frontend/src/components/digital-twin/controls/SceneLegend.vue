<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AQI_BANDS, TEMPERATURE_BANDS, bandRanges } from '@/helpers/colors.ts'
import { Mode, useModes } from '@/composables/scene/useModes.ts'

const { t } = useI18n()
const { currentMode } = useModes()

const legend = computed(() => {
  if (currentMode.value === Mode.TemperatureSensor)
    return { title: 'model.legend.temperature', unit: '°C', bands: bandRanges(TEMPERATURE_BANDS) }
  if (currentMode.value === Mode.AirQualitySensor)
    return { title: 'model.legend.airQuality', unit: '', bands: bandRanges(AQI_BANDS) }
  return null
})

const rangeLabel = (from: number | null, to: number | null, unit: string) =>
  from === null ? `< ${to}${unit}` : to === null ? `≥ ${from}${unit}` : `${from}–${to}${unit}`
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="legend"
      class="surface-card flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-full bg-surface-container-lowest/90 px-5 py-2 shadow-lift backdrop-blur-md"
    >
      <span class="text-label-header uppercase text-on-surface-variant">{{ t(legend.title) }}</span>
      <span
        v-for="band in legend.bands"
        :key="band.key"
        class="inline-flex items-center gap-1.5 text-label-stat"
      >
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: band.color }" />
        {{ t(`model.legend.bands.${band.key}`) }}
        <span class="tabular-nums text-on-surface-variant">
          {{ rangeLabel(band.from, band.to, legend.unit) }}
        </span>
      </span>
    </div>
  </Transition>
</template>
