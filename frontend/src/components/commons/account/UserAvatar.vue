<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { initialsOf, toneIndexOf } from '@/utils/commons/avatar.ts'

const props = withDefaults(
  defineProps<{ name?: string; email?: string; picture?: string; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)

const TONES = [
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-container text-on-tertiary-container',
  'bg-primary/15 text-primary',
  'bg-warning-container text-on-warning-container',
  'bg-error-container text-on-error-container',
  'bg-surface-container-highest text-on-surface',
]

const SIZE = {
  sm: 'size-8 text-label-stat',
  md: 'size-10 text-body-sm',
  lg: 'size-14 text-title-sm',
}

// Google avatar URLs expire; a broken one falls back to initials.
const imageFailed = ref(false)
watch(
  () => props.picture,
  () => (imageFailed.value = false),
)

const initials = computed(() => initialsOf(props.name, props.email))
const tone = computed(() => TONES[toneIndexOf(props.name || props.email || '', TONES.length)])
</script>

<template>
  <img
    v-if="picture && !imageFailed"
    :src="picture"
    :alt="name || email"
    class="shrink-0 rounded-full object-cover ring-2 ring-surface-container-lowest"
    :class="SIZE[size]"
    @error="imageFailed = true"
  />
  <span
    v-else
    class="flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-surface-container-lowest"
    :class="[SIZE[size], tone]"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>
