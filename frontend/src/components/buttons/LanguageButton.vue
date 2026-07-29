<script setup lang="ts">
defineProps<{
  label: string
  isActive: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<template>
  <button
    @click="$emit('select')"
    class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
    :class="isActive ? 'text-emerald-600 font-bold' : 'text-slate-600'"
  >
    {{ label }}
  </button>
</template>
