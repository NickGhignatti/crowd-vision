<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Mode, useModes } from '@/composables/digital-twin/useModes.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { nextRenderStyle } from '@/utils/digital-twin/renderStyle.ts'
import IconButton from '@/components/commons/base/IconButton.vue'

defineProps<{ canFocus: boolean; isFocused: boolean; isRotating: boolean }>()

defineEmits<{
  reset: []
  focus: []
  'zoom-in': []
  'zoom-out': []
  rotate: []
}>()

const { t } = useI18n()
const { currentMode, changeMode } = useModes()
const { current: renderStyle, setStyle } = useRenderStyle()
const { isEditing, userCanEdit, setEditing } = useSensorEditor()

const toggleSensorEditing = () =>
  setEditing(!isEditing.value, () => window.confirm(t('model.sensors.discardConfirm')))
</script>

<template>
  <div
    role="toolbar"
    :aria-label="t('model.controls.toolbar')"
    class="surface-card flex items-center gap-1 rounded-full bg-surface-container-lowest/90 px-2 py-1.5 shadow-lift backdrop-blur-md"
  >
    <IconButton
      icon="cube"
      :label="t('model.controls.buttons.reset')"
      :disabled="isRotating"
      @click="$emit('reset')"
    />
    <IconButton
      :icon="isFocused ? 'arrows-in' : 'arrows-out'"
      :label="t('model.controls.buttons.focus')"
      :active="isFocused"
      :disabled="!canFocus || isRotating"
      @click="$emit('focus')"
    />
    <IconButton
      icon="magnifying-glass-plus"
      :label="t('model.controls.buttons.zoomIn')"
      :disabled="isRotating"
      @click="$emit('zoom-in')"
    />
    <IconButton
      icon="magnifying-glass-minus"
      :label="t('model.controls.buttons.zoomOut')"
      :disabled="isRotating"
      @click="$emit('zoom-out')"
    />
    <IconButton
      icon="arrows-clockwise"
      :label="t('model.controls.buttons.panorama')"
      :active="isRotating"
      @click="$emit('rotate')"
    />

    <span class="mx-1 h-6 w-px bg-outline-variant" />

    <IconButton
      icon="thermometer"
      :label="t('model.controls.buttons.temperature')"
      :active="currentMode === Mode.TemperatureSensor"
      @click="changeMode(Mode.TemperatureSensor)"
    />
    <IconButton
      icon="wind"
      :label="t('model.controls.buttons.airQuality')"
      :active="currentMode === Mode.AirQualitySensor"
      @click="changeMode(Mode.AirQualitySensor)"
    />

    <template v-if="userCanEdit">
      <span class="mx-1 h-6 w-px bg-outline-variant" />

      <IconButton
        icon="broadcast"
        :label="t('model.controls.buttons.editSensors')"
        :active="isEditing"
        @click="toggleSensorEditing"
      />
    </template>

    <span class="mx-1 h-6 w-px bg-outline-variant" />

    <IconButton
      icon="paint-brush"
      :label="
        t('model.controls.buttons.renderStyle', {
          style: t(`model.controls.renderStyles.${renderStyle}`),
        })
      "
      @click="setStyle(nextRenderStyle(renderStyle))"
    />
  </div>
</template>
