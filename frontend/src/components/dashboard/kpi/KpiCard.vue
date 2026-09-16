<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

withDefaults(
  defineProps<{
    label: string
    icon: string
    value: string
    unit?: string
    caption?: string
    loading?: boolean
    alert?: boolean
  }>(),
  { unit: '' },
)
</script>

<template>
  <article
    class="surface-card flex flex-col gap-1 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
    :class="alert && 'bg-error-container/40 ring-error/30'"
  >
    <header class="flex items-center justify-between text-on-surface-variant">
      <h3 class="text-label-stat">{{ label }}</h3>
      <BaseIcon :name="icon" class="text-xl" :class="alert ? 'text-error' : 'text-primary'" />
    </header>

    <div v-if="loading" class="my-1 h-9 w-24 animate-pulse rounded-lg bg-surface-container" />
    <p v-else class="flex items-baseline gap-1.5">
      <span class="text-headline-lg tabular-nums" :class="alert ? 'text-error' : 'text-on-surface'">
        {{ value }}
      </span>
      <span v-if="unit" class="text-body-sm text-on-surface-variant">{{ unit }}</span>
    </p>

    <slot>
      <p v-if="caption" class="text-label-stat text-on-surface-variant">{{ caption }}</p>
    </slot>
  </article>
</template>
