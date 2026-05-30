<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  min: number
  max: number
  step?: number
  minValue: number
  maxValue: number
  unit?: string
  activeColor?: string
}>()

const emit = defineEmits<{
  (e: 'update:minValue', value: number): void
  (e: 'update:maxValue', value: number): void
}>()

const resolvedStep = computed(() => props.step ?? 1)
const resolvedColor = computed(() => props.activeColor ?? '#10b981')

const localMin = ref(props.minValue)
const localMax = ref(props.maxValue)

watch(() => props.minValue, (v) => { localMin.value = v })
watch(() => props.maxValue, (v) => { localMax.value = v })

const leftPercent = computed(
  () => ((localMin.value - props.min) / (props.max - props.min)) * 100,
)
const rightPercent = computed(
  () => ((localMax.value - props.min) / (props.max - props.min)) * 100,
)

const onMinInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  localMin.value = Math.min(val, localMax.value - resolvedStep.value)
  emit('update:minValue', localMin.value)
}

const onMaxInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  localMax.value = Math.max(val, localMin.value + resolvedStep.value)
  emit('update:maxValue', localMax.value)
}
</script>

<template>
  <div class="w-full select-none">
    <div class="flex justify-between mb-3">
      <span class="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
        {{ localMin }}{{ unit }}
      </span>
      <span class="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
        {{ localMax }}{{ unit }}
      </span>
    </div>

    <div class="relative h-6 flex items-center">
      <div class="absolute w-full h-1.5 bg-slate-200 rounded-full"></div>
      <div
        class="absolute h-1.5 rounded-full pointer-events-none"
        :style="{
          left: leftPercent + '%',
          right: 100 - rightPercent + '%',
          backgroundColor: resolvedColor,
        }"
      ></div>

      <input
        type="range"
        :min="min"
        :max="max"
        :step="resolvedStep"
        :value="localMin"
        class="range-thumb"
        :style="{ color: resolvedColor }"
        @input="onMinInput"
      />
      <input
        type="range"
        :min="min"
        :max="max"
        :step="resolvedStep"
        :value="localMax"
        class="range-thumb"
        :style="{ color: resolvedColor }"
        @input="onMaxInput"
      />
    </div>

    <div class="flex justify-between mt-1.5">
      <span class="text-[10px] text-slate-400">{{ min }}{{ unit }}</span>
      <span class="text-[10px] text-slate-400">{{ max }}{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.range-thumb {
  position: absolute;
  width: 100%;
  height: 1.5rem;
  appearance: none;
  background: transparent;
  pointer-events: none;
  outline: none;
  margin: 0;
  padding: 0;
}

.range-thumb::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  border: 2.5px solid currentColor;
  cursor: pointer;
  pointer-events: all;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.range-thumb::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.range-thumb::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  border: 2.5px solid currentColor;
  cursor: pointer;
  pointer-events: all;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
</style>
