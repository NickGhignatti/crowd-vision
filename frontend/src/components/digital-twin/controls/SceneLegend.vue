<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AQI_BANDS,
  TEMPERATURE_SCALE,
  bandRanges,
  temperatureGradient,
} from '@/utils/digital-twin/colors.ts'
import { Mode, useModes } from '@/composables/digital-twin/useModes.ts'

const { t } = useI18n()
const { currentMode } = useModes()

const isTemperature = computed(() => currentMode.value === Mode.TemperatureSensor)
const gradient = temperatureGradient()
const span = -TEMPERATURE_SCALE[0].offset
// A stop closer than 2° to the next would print its label on top of that one.
const ticks = TEMPERATURE_SCALE.filter(
  ({ offset }, i, all) => i === all.length - 1 || all[i + 1]!.offset - offset >= 2,
).map(({ offset }) => ({ offset, left: `${((offset + span) / span) * 100}%` }))

const legend = computed(() => {
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
      v-if="isTemperature"
      class="surface-card flex items-center gap-3 rounded-full bg-surface-container-lowest/90 px-5 py-2 shadow-lift backdrop-blur-md"
    >
      <span class="text-label-header uppercase text-on-surface-variant">
        {{ t('model.legend.temperature') }}
      </span>
      <div class="flex w-48 flex-col gap-1">
        <span class="h-2.5 rounded-full" :style="{ backgroundImage: gradient }" />
        <span class="relative h-3 text-label-stat tabular-nums text-on-surface-variant">
          <span
            v-for="tick in ticks"
            :key="tick.offset"
            class="absolute -translate-x-1/2"
            :style="{ left: tick.left }"
          >
            {{ tick.offset === 0 ? t('model.legend.limit') : `${tick.offset}°` }}
          </span>
        </span>
      </div>
    </div>
    <div
      v-else-if="legend"
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
