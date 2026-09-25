<script setup lang="ts">
import TopNavBar from '@/components/commons/layout/TopNavBar.vue'

/**
 * `page` pads and centres the content; `fill` gives it the whole viewport below the bar (the 3D
 * twin); `bare` leaves full-width sections to lay themselves out (the homepage).
 */
withDefaults(defineProps<{ variant?: 'page' | 'fill' | 'bare' }>(), { variant: 'page' })

const MAIN = {
  page: 'mx-auto w-full max-w-[1720px] flex-1 space-y-6 px-4 py-6 md:px-margin',
  fill: 'relative flex min-h-0 flex-1',
  bare: 'flex-1',
}
</script>

<template>
  <div class="flex min-h-full flex-col" :class="variant === 'fill' && 'h-screen overflow-hidden'">
    <TopNavBar />
    <main :class="MAIN[variant]">
      <slot />
    </main>
    <slot name="footer" />
  </div>
</template>
