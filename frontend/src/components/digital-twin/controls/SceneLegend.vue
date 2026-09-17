<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AQI_SCALE,
  TEMPERATURE_SCALE,
  aqiGradient,
  temperatureGradient,
} from '@/utils/digital-twin/colors.ts'
import { Mode, useModes } from '@/composables/digital-twin/useModes.ts'

const { t } = useI18n()
const { currentMode } = useModes()

const position = (value: number, first: number, last: number) =>
  `${((value - first) / (last - first)) * 100}%`

// A temperature stop closer than 2° to the next would print its label on top of that one.
const temperatureTicks = TEMPERATURE_SCALE.filter(
  ({ offset }, i, all) => i === all.length - 1 || all[i + 1]!.offset - offset >= 2,
).map(({ offset }) => ({
  key: offset,
  left: position(offset, TEMPERATURE_SCALE[0].offset, 0),
  label: offset === 0 ? t('model.legend.limit') : `${offset}°`,
}))

// Only the band edges people know get a label; the stops between them only shape the blend.
const AQI_TICKS = [0, 50, 75, 100]
const aqiMax = AQI_SCALE[AQI_SCALE.length - 1]!.at
const aqiTicks = AQI_TICKS.map((at) => ({
  key: at,
  left: position(at, 0, aqiMax),
  label: at === aqiMax ? `${at}+` : `${at}`,
}))

const legend = computed(() => {
  if (currentMode.value === Mode.TemperatureSensor)
    return {
      title: 'model.legend.temperature',
      gradient: temperatureGradient(),
      ticks: temperatureTicks,
    }
  if (currentMode.value === Mode.AirQualitySensor)
    return { title: 'model.legend.airQuality', gradient: aqiGradient(), ticks: aqiTicks }
  return null
})
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
      class="surface-card flex items-center gap-3 rounded-full bg-surface-container-lowest/90 px-5 py-2 shadow-lift backdrop-blur-md"
    >
      <span class="text-label-header uppercase text-on-surface-variant">
        {{ t(legend.title) }}
      </span>
      <div class="flex w-48 flex-col gap-1">
        <span class="h-2.5 rounded-full" :style="{ backgroundImage: legend.gradient }" />
        <span class="relative h-3 text-label-stat tabular-nums text-on-surface-variant">
          <span
            v-for="tick in legend.ticks"
            :key="tick.key"
            class="absolute -translate-x-1/2"
            :style="{ left: tick.left }"
          >
            {{ tick.label }}
          </span>
        </span>
      </div>
    </div>
  </Transition>
</template>
