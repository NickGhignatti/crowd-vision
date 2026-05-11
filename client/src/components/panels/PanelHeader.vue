<script setup lang="ts">
defineProps<{
  title: string
  side?: 'left' | 'right'
}>()

const emit = defineEmits<{ (e: 'toggle'): void }>()
</script>

<template>
  <div class="px-6 pt-6 pb-2 shrink-0 bg-white border-b border-transparent z-10">
    <div class="flex justify-between items-center h-10 mb-4">
      <div class="flex items-center flex-1 overflow-hidden gap-2">
        <slot name="title">
          <h2 class="text-lg font-bold text-slate-800 whitespace-nowrap">{{ title }}</h2>
        </slot>
        <slot name="search" />
      </div>

      <button
        @click="emit('toggle')"
        class="text-slate-400 hover:text-emerald-600 transition-colors p-1 ml-1 shrink-0"
      >
        <i
          class="ph-bold text-xl"
          :class="side === 'left' ? 'ph-caret-left' : 'ph-caret-right'"
        ></i>
      </button>
    </div>
  </div>
</template>
