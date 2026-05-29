<script setup lang="ts">
defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div
    class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white"
  >
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
        <i class="ph-bold ph-sparkle text-lg"></i>
      </div>
      <div class="leading-tight">
        <div class="font-semibold text-sm">CrowdVision Agent</div>
        <div class="text-xs text-emerald-50/90">Ask anything about your twin</div>
      </div>
    </div>
    <button
      @click="$emit('close')"
      class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
      aria-label="Close chat"
    >
      <i class="ph-bold ph-x text-base"></i>
    </button>
  </div>
</template>
