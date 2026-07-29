<script setup lang="ts">
defineProps<{
  side?: 'left' | 'right'
}>()

const isOpen = defineModel<boolean>({ default: true })
</script>

<template>
  <aside
    class="bg-white transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="[
      side === 'left' ? 'border-r border-slate-200' : 'border-l border-slate-200',
      isOpen ? 'w-80' : 'w-0 overflow-hidden border-none',
    ]"
  >
    <div class="h-full flex flex-col w-80">
      <slot />
    </div>
  </aside>

  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
  >
    <button
      v-if="!isOpen"
      @click="isOpen = true"
      class="absolute z-40 bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:text-emerald-600 hover:scale-105 transition-all"
      :class="side === 'left' ? 'left-6 top-4' : 'right-6 top-4'"
    >
      <i class="ph-bold text-xl" :class="side === 'left' ? 'ph-caret-right' : 'ph-caret-left'"></i>
    </button>
  </Transition>
</template>
