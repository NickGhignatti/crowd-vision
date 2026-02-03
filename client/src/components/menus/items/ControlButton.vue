<script setup lang="ts">
interface Props {
  icon: string
  title?: string
  disabled?: boolean
  active?: boolean
}

defineProps<Props>()
defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    @click="$emit('click')"
    :disabled="disabled"
    :title="title"
    class="p-2 transition-colors"
    :class="
      disabled
        ? 'text-slate-300 cursor-not-allowed'
        : active
          ? 'text-emerald-600 hover:text-emerald-700'
          : 'text-slate-500 hover:text-emerald-600'
    "
  >
    <i class="ph-bold text-xl" :class="icon"></i>
  </button>
</template>
