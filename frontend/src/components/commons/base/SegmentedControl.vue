<script setup lang="ts" generic="T extends string">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

export interface SegmentOption<V> {
  value: V
  label: string
  icon?: string
}

withDefaults(defineProps<{ options: SegmentOption<T>[]; label: string; size?: 'sm' | 'md' }>(), {
  size: 'md',
})

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="inline-flex shrink-0 gap-0.5 rounded-xl bg-surface-container p-1"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="inline-flex items-center gap-1.5 rounded-lg transition-all"
      :class="[
        size === 'sm' ? 'px-2.5 py-1 text-label-stat' : 'px-3 py-1.5 text-body-sm',
        model === option.value
          ? 'bg-surface-container-lowest font-semibold text-primary shadow-soft'
          : 'font-medium text-on-surface-variant hover:text-on-surface',
      ]"
      @click="model = option.value"
    >
      <BaseIcon v-if="option.icon" :name="option.icon" class="text-base" />
      {{ option.label }}
    </button>
  </div>
</template>
