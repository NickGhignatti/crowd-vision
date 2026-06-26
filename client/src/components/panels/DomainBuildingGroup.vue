<script setup lang="ts">
// Collapsible "--- Domain ---" divider grouping the building cards of one domain.
defineProps<{
  name: string
  count: number
  open: boolean
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <div>
    <button
      type="button"
      class="w-full flex items-center gap-2 py-2 select-none"
      :aria-expanded="open"
      @click="$emit('toggle')"
    >
      <span class="h-px flex-1 bg-slate-200"></span>
      <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <i
          class="ph-bold ph-caret-down text-sm transition-transform duration-200"
          :class="{ '-rotate-90': !open }"
        ></i>
        <span class="truncate max-w-[10rem]">{{ name }}</span>
        <span class="text-slate-400 font-medium normal-case">({{ count }})</span>
      </span>
      <span class="h-px flex-1 bg-slate-200"></span>
    </button>

    <div v-show="open" class="space-y-1">
      <slot />
    </div>
  </div>
</template>
