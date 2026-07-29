<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    name?: string
    email?: string
    picture?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

// Google avatar URLs occasionally 404 (revoked/expired) — fall back to the
// initials avatar rather than showing a broken image.
const imageFailed = ref(false)
watch(() => props.picture, () => (imageFailed.value = false))

const showImage = computed(() => !!props.picture && !imageFailed.value)

const initials = computed(() => {
  const source = props.name?.trim() || props.email?.trim() || ''
  if (!source) return '?'
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
})

// A fixed, deterministic palette keyed off the account's name/email, so a
// given account always gets the same color rather than a random one on
// every render.
const palette = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
]

const colorClass = computed(() => {
  const source = props.name || props.email || ''
  let hash = 0
  for (const char of source) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-8 h-8 text-xs'
    case 'lg':
      return 'w-14 h-14 text-lg'
    default:
      return 'w-10 h-10 text-sm'
  }
})
</script>

<template>
  <img
    v-if="showImage"
    :src="picture"
    :alt="name || email || 'Account'"
    class="rounded-full object-cover border border-slate-200"
    :class="sizeClass"
    @error="imageFailed = true"
  />
  <span
    v-else
    class="rounded-full flex items-center justify-center font-bold border border-emerald-200"
    :class="[sizeClass, colorClass]"
  >
    {{ initials }}
  </span>
</template>
