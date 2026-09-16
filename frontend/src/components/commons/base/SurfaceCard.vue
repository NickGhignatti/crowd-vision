<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

withDefaults(
  defineProps<{
    title?: string
    description?: string
    icon?: string
    padded?: boolean
    as?: string
  }>(),
  { padded: true, as: 'section' },
)
</script>

<template>
  <component :is="as" class="surface-card flex flex-col" :class="padded && 'p-5 md:p-6'">
    <header
      v-if="title || $slots.header || $slots.actions"
      class="flex items-start justify-between gap-3"
      :class="padded ? 'mb-5' : 'px-5 pb-2 pt-5 md:px-6'"
    >
      <slot name="header">
        <div class="flex min-w-0 items-center gap-3">
          <span
            v-if="icon"
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg text-primary"
          >
            <BaseIcon :name="icon" />
          </span>
          <div class="min-w-0">
            <h2 class="truncate text-title-sm text-on-surface">{{ title }}</h2>
            <p v-if="description" class="text-body-sm text-on-surface-variant">
              {{ description }}
            </p>
          </div>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>
