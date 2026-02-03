<script setup lang="ts">
import ControlButton from '@/components/menus/items/ControlButton.vue'

interface Props {
  selectedRoomId: string | null
  isExploded: boolean
}

defineProps<Props>()

defineEmits<{
  resetView: []
  toggleExplode: []
  zoomIn: []
  zoomOut: []
}>()
</script>

<template>
  <div
    class="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-slate-200/50 z-10"
  >
    <ControlButton icon="ph-cube" title="Reset View" @click="$emit('resetView')" />

    <ControlButton
      :icon="isExploded ? 'ph-arrows-in' : 'ph-arrows-out'"
      title="Focus on Room"
      :disabled="!selectedRoomId"
      :active="isExploded"
      @click="$emit('toggleExplode')"
    />

    <ControlButton icon="ph-plus" title="Zoom In" @click="$emit('zoomIn')" />

    <ControlButton icon="ph-minus" title="Zoom Out" @click="$emit('zoomOut')" />
  </div>
</template>
