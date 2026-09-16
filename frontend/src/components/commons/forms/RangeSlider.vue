<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    min: number
    max: number
    step?: number
    unit?: string
    color?: string
    label: string
  }>(),
  { step: 1, unit: '', color: 'var(--cv-primary)' },
)

const low = defineModel<number>('low', { required: true })
const high = defineModel<number>('high', { required: true })

const percentOf = (value: number) => ((value - props.min) / (props.max - props.min)) * 100

const track = computed(() => ({
  left: `${percentOf(low.value)}%`,
  right: `${100 - percentOf(high.value)}%`,
  backgroundColor: props.color,
}))

// The two thumbs share a track, so each is kept a step clear of the other.
const setLow = (event: Event) => {
  low.value = Math.min(Number((event.target as HTMLInputElement).value), high.value - props.step)
}
const setHigh = (event: Event) => {
  high.value = Math.max(Number((event.target as HTMLInputElement).value), low.value + props.step)
}
</script>

<template>
  <div class="w-full select-none" :style="{ color }">
    <div class="mb-2 flex justify-between text-label-stat font-semibold text-on-surface">
      <span class="rounded-full bg-surface-container px-2 py-0.5 tabular-nums">
        {{ low }}{{ unit }}
      </span>
      <span class="rounded-full bg-surface-container px-2 py-0.5 tabular-nums">
        {{ high }}{{ unit }}
      </span>
    </div>

    <div class="relative flex h-6 items-center">
      <div class="absolute h-1.5 w-full rounded-full bg-surface-container-high" />
      <div class="pointer-events-none absolute h-1.5 rounded-full" :style="track" />
      <input
        type="range"
        class="range-thumb"
        :min="min"
        :max="max"
        :step="step"
        :value="low"
        :aria-label="`${label} min`"
        @input="setLow"
      />
      <input
        type="range"
        class="range-thumb"
        :min="min"
        :max="max"
        :step="step"
        :value="high"
        :aria-label="`${label} max`"
        @input="setHigh"
      />
    </div>

    <div class="mt-1 flex justify-between text-[10px] text-on-surface-variant">
      <span>{{ min }}{{ unit }}</span>
      <span>{{ max }}{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.range-thumb {
  position: absolute;
  width: 100%;
  height: 1.5rem;
  margin: 0;
  appearance: none;
  background: transparent;
  pointer-events: none;
}

.range-thumb::-webkit-slider-thumb {
  width: 18px;
  height: 18px;
  appearance: none;
  border: 2.5px solid currentColor;
  border-radius: 50%;
  background: var(--cv-surface-container-lowest);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
  cursor: pointer;
  pointer-events: all;
  transition: transform 0.1s ease;
}

.range-thumb::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.range-thumb::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: 2.5px solid currentColor;
  border-radius: 50%;
  background: var(--cv-surface-container-lowest);
  cursor: pointer;
  pointer-events: all;
}
</style>
