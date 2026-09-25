<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ name: string; count: number; open: boolean }>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <section>
    <button
      type="button"
      class="flex w-full items-center gap-1.5 rounded-md px-1 py-2 text-left text-label-header uppercase text-on-surface-variant hover:text-on-surface"
      :aria-expanded="open"
      @click="$emit('toggle')"
    >
      <BaseIcon name="caret-down" class="transition-transform" :class="!open && '-rotate-90'" />
      <span class="min-w-0 flex-1 truncate">{{ name }}</span>
      <span class="rounded-full bg-surface-container px-1.5 text-[10px]">{{ count }}</span>
    </button>
    <div v-show="open" class="space-y-1">
      <slot />
    </div>
  </section>
</template>
