<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ icon: string; title: string; description: string }>()
</script>

<template>
  <article class="surface-card group w-[90%] p-7 md:w-[360px]">
    <span
      class="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary transition-transform duration-300 group-hover:scale-110"
    >
      <BaseIcon :name="icon" />
    </span>
    <h3 class="mb-2 text-headline-md text-on-surface">{{ title }}</h3>
    <p class="text-body-md text-on-surface-variant">{{ description }}</p>
  </article>
</template>
