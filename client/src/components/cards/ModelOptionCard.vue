<script setup lang="ts">
defineProps<{
  label: string
  isSelected?: boolean
}>()

defineEmits<{ (e: 'select'): void }>()
</script>

<template>
  <li>
    <button
      @click="$emit('select')"
      class="w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between group"
      :class="
        isSelected
          ? 'bg-emerald-50 text-emerald-700 font-medium'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      "
    >
      <span>{{ label }}</span>
      <i v-if="isSelected" class="ph-bold ph-check text-emerald-600"></i>
    </button>
  </li>
</template>
