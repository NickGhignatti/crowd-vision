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
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { useDeviceKinds } from '@/composables/digital-twin/useDeviceKinds.ts'
import { groupByType, sensorIcon } from '@/utils/digital-twin/sensors.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const { t } = useI18n()
const { currentMode } = useModes()
const { rows, isEditing, hiddenTypes, toggleType } = useSensorEditor()
const { labelOf } = useDeviceKinds()

const showsSensors = computed(() => currentMode.value === Mode.Sensors || isEditing.value)
// One chip is nothing to choose between, so the row only earns its space from two kinds up.
const chips = computed(() => (showsSensors.value ? groupByType(rows.value) : []))

const position = (value: number, first: number, last: number) =>
  `${((value - first) / (last - first)) * 100}%`

// Labels sit at least 2° apart; the stops between them only shape the blend.
const TEMPERATURE_TICKS = [-12, -7, -5, -3, 0]
const temperatureTicks = TEMPERATURE_TICKS.map((offset) => ({
  key: offset,
  left: position(offset, TEMPERATURE_SCALE[0].offset, 0),
  label: offset === 0 ? t('model.legend.limit') : `${offset}°`,
}))

// Only the band edges people know get a label.
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
  <div class="flex flex-col items-center gap-2">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="chips.length > 1"
        role="group"
        :aria-label="t('model.sensors.filterLabel')"
        class="surface-card flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-3 py-1.5 shadow-lift backdrop-blur-md"
      >
        <button
          v-for="chip in chips"
          :key="chip.sensorType"
          type="button"
          class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-stat transition-colors"
          :class="
            hiddenTypes.has(chip.sensorType)
              ? 'text-on-surface-variant opacity-60 hover:bg-surface-container-low'
              : 'bg-primary/10 text-primary'
          "
          :aria-pressed="!hiddenTypes.has(chip.sensorType)"
          @click="toggleType(chip.sensorType)"
        >
          <BaseIcon :name="sensorIcon(chip.sensorType)" />
          {{ labelOf(chip.sensorType) }}
          <span class="tabular-nums opacity-70">{{ chip.count }}</span>
        </button>
      </div>
    </Transition>

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
  </div>
</template>
