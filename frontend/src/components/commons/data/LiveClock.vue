<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDateTime } from '@/composables/core/useDateTime.ts'

withDefaults(defineProps<{ size?: 'md' | 'lg' }>(), { size: 'md' })

const { locale } = useI18n()
const { formattedTime, formattedDate } = useDateTime(locale)
</script>

<template>
  <div class="flex flex-col">
    <time
      class="leading-none tabular-nums text-on-surface"
      :class="size === 'lg' ? 'text-display-clock' : 'text-headline-md'"
    >
      {{ formattedTime }}
    </time>
    <span class="mt-1 text-label-stat capitalize text-on-surface-variant">{{ formattedDate }}</span>
  </div>
</template>
