<script setup lang="ts">
import type { Tone } from '@/utils/commons/tone.ts'

withDefaults(defineProps<{ tone?: Tone; pulse?: boolean; size?: 'sm' | 'md' }>(), {
  tone: 'primary',
  size: 'sm',
})

const TONE: Record<Tone, string> = {
  neutral: 'bg-outline',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
  success: 'bg-primary',
  warning: 'bg-warning',
  danger: 'bg-error',
}
</script>

<template>
  <span class="relative inline-flex shrink-0" :class="size === 'sm' ? 'size-2' : 'size-3'">
    <span
      v-if="pulse"
      class="absolute inline-flex size-full animate-ping rounded-full opacity-75"
      :class="TONE[tone]"
    />
    <span class="relative inline-flex size-full rounded-full" :class="TONE[tone]" />
  </span>
</template>
