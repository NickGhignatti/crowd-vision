<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

withDefaults(
  defineProps<{ icon?: string; title: string; description?: string; compact?: boolean }>(),
  { icon: 'magnifying-glass' },
)
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'gap-1.5 px-4 py-6' : 'gap-3 px-6 py-12'"
  >
    <span
      class="flex items-center justify-center rounded-2xl bg-surface-container text-on-surface-variant"
      :class="compact ? 'size-9 text-lg' : 'size-14 text-2xl'"
    >
      <BaseIcon :name="icon" />
    </span>
    <p class="text-title-sm text-on-surface" :class="compact && 'text-body-md'">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-body-sm text-on-surface-variant">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
