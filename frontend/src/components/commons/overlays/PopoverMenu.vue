<script setup lang="ts">
import { ref } from 'vue'
import { useDismiss } from '@/composables/ui/useDismiss.ts'

withDefaults(defineProps<{ align?: 'start' | 'end'; width?: string }>(), {
  align: 'end',
  width: 'w-56',
})

const open = defineModel<boolean>('open', { default: false })
const root = ref<HTMLElement | null>(null)

const close = () => (open.value = false)
const toggle = () => (open.value = !open.value)

useDismiss(root, open, close)
</script>

<template>
  <div ref="root" class="relative">
    <slot name="trigger" :toggle="toggle" :open="open" />

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="open"
        role="menu"
        class="surface-card absolute top-full z-50 mt-2 overflow-hidden p-1.5 shadow-lift"
        :class="[width, align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left']"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>
