<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>

<template>
  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex min-w-0 items-center gap-3">
      <span
        v-if="icon"
        class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl text-on-primary shadow-soft"
      >
        <BaseIcon :name="icon" />
      </span>
      <div class="min-w-0">
        <h1 class="truncate text-headline-lg text-on-surface">{{ title }}</h1>
        <p v-if="subtitle" class="text-body-md text-on-surface-variant">{{ subtitle }}</p>
      </div>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2.5">
      <slot />
    </div>
  </div>
</template>
