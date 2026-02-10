<script setup lang="ts">
import ControlButton from '@/components/buttons/ControlButton.vue'

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  selectedRoomId: string | null
  isExploded: boolean
  disabled?: boolean
}

defineProps<Props>()

defineEmits<{
  resetView: []
  toggleExplode: []
  zoomIn: []
  zoomOut: []
  togglePanorama: []
}>()
</script>

<template>
  <div
    class="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-slate-200/50 z-10"
  >
    <ControlButton
      icon="ph-cube"
      :title="t('model.controls.buttons.reset')"
      @click="$emit('resetView')"
      :disabled="disabled"
    />

    <ControlButton
      :icon="isExploded ? 'ph-arrows-in' : 'ph-arrows-out'"
      :title="t('model.controls.buttons.focus')"
      :disabled="!selectedRoomId || disabled"
      :active="isExploded"
      @click="$emit('toggleExplode')"
    />

    <ControlButton
      icon="ph-plus"
      :title="t('model.controls.buttons.zoomIn')"
      @click="$emit('zoomIn')"
      :disabled="disabled"
    />

    <ControlButton
      icon="ph-minus"
      :title="t('model.controls.buttons.zoomOut')"
      @click="$emit('zoomOut')"
      :disabled="disabled"
    />

    <ControlButton
      icon="ph-camera"
      :title="t('model.controls.buttons.panorama')"
      @click="$emit('togglePanorama')"
    />
  </div>
</template>
