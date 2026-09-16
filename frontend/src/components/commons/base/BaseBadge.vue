<script setup lang="ts">
import type { Tone } from '@/utils/commons/tone.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

withDefaults(
  defineProps<{
    tone?: Tone
    icon?: string
    size?: 'sm' | 'md'
    shape?: 'pill' | 'square'
  }>(),
  { tone: 'neutral', size: 'md', shape: 'pill' },
)

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  primary: 'bg-primary/12 text-primary',
  secondary: 'bg-secondary/12 text-secondary',
  tertiary: 'bg-tertiary-container text-on-tertiary-container',
  success: 'bg-secondary-container text-on-secondary-container',
  warning: 'bg-warning-container text-on-warning-container',
  danger: 'bg-error-container text-on-error-container',
}
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold"
    :class="[
      TONE[tone],
      shape === 'pill' ? 'rounded-full' : 'rounded',
      size === 'sm' ? 'px-1.5 py-0.5 text-[10px] leading-3' : 'px-2.5 py-1 text-label-stat',
    ]"
  >
    <BaseIcon v-if="icon" :name="icon" class="text-[1.1em]" />
    <slot />
  </span>
</template>
