<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ icon?: string; danger?: boolean; checked?: boolean }>()

defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    role="menuitem"
    class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-body-sm transition-colors"
    :class="
      danger
        ? 'text-error hover:bg-error-container'
        : checked
          ? 'bg-secondary-container font-semibold text-on-secondary-container'
          : 'text-on-surface hover:bg-surface-container-low'
    "
    @click="$emit('select')"
  >
    <BaseIcon v-if="icon" :name="icon" class="shrink-0 text-lg" />
    <span class="min-w-0 flex-1 truncate"><slot /></span>
    <BaseIcon v-if="checked" name="check" class="shrink-0" />
    <slot name="trailing" />
  </button>
</template>
