<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'toggle'): void
}>()
</script>

<template>
  <button
    @click="$emit('toggle')"
    class="group relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-xl flex items-center justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-emerald-500/40 hover:shadow-2xl active:scale-95"
    :aria-label="isOpen ? 'Close chat' : 'Open chat'"
  >
    <span
      v-if="!isOpen"
      class="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping group-hover:hidden"
    />
    <i
      class="ph-bold text-2xl relative z-10 transition-transform duration-300"
      :class="isOpen ? 'ph-x rotate-90' : 'ph-chat-circle-dots'"
    ></i>
  </button>
</template>
