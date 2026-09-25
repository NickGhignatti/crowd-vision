<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Fraction filled, 0 to 1; out-of-range values are clamped. */
    value: number | null
    color?: string
    size?: 'sm' | 'md'
    label?: string
  }>(),
  { size: 'sm' },
)

const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.value ?? 0)) * 100))
</script>

<template>
  <div
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
    class="w-full overflow-hidden rounded-full bg-surface-container-high"
    :class="size === 'sm' ? 'h-1.5' : 'h-2'"
  >
    <div
      class="h-full rounded-full transition-[width] duration-300"
      :class="!color && 'bg-primary'"
      :style="{ width: `${percent}%`, backgroundColor: color }"
    />
  </div>
</template>
