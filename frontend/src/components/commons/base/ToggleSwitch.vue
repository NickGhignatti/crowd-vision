<script setup lang="ts">
withDefaults(defineProps<{ label: string; size?: 'sm' | 'md' }>(), { size: 'md' })

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    class="relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors"
    :class="[
      size === 'sm' ? 'h-[18px] w-8' : 'h-6 w-11',
      model ? 'bg-primary' : 'bg-outline-variant',
    ]"
    @click="model = !model"
  >
    <span
      class="pointer-events-none inline-block rounded-full bg-surface-container-lowest shadow transition-transform"
      :class="[
        size === 'sm' ? 'size-3.5' : 'size-5',
        model ? (size === 'sm' ? 'translate-x-4' : 'translate-x-[22px]') : 'translate-x-0.5',
      ]"
    />
  </button>
</template>
