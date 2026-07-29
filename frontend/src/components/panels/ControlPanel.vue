<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ControlButton from '@/components/buttons/ControlButton.vue'
import EditToolbar from '@/components/panels/EditToolbar.vue'
import { Mode, useModes } from '@/composables/scene/useModes.ts'
import type { BuildingControlPanelProps } from '@/interfaces/building.ts'

// EditToolbar's own props/emits (dirty, activeTool, @save, ...) aren't
// declared here — they fall through to $attrs and get forwarded straight to
// the nested <EditToolbar>, so this component doesn't have to re-declare and
// re-wire every one of them just to pass them one level down.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const mode = useModes()

defineProps<BuildingControlPanelProps>()

defineEmits<{
  resetView: []
  toggleExplode: []
  zoomIn: []
  zoomOut: []
  togglePanorama: []
  enterEdit: []
  exitEdit: []
}>()

// Collapse/expand via max-width — driven from JS (:css="false"), not Tailwind
// classes. A static resting class (e.g. max-w-[22rem]) and a Vue enter/leave
// class (max-w-0) both set the same property on the same element for one
// frame; which one the browser honors depends on Tailwind's generated CSS
// source order, not on which was added later — so the "collapsed" state can
// silently lose the cascade and the whole thing snaps instead of animating.
// Measuring the real content width sidesteps that ambiguity (one inline
// style, unambiguous specificity) and avoids guessing a width cap that may
// not match the actual content.
const GROUP_TRANSITION_MS = 300

const growFromZero = (el: Element, done: () => void) => {
  const element = el as HTMLElement
  const targetWidth = element.scrollWidth
  element.style.maxWidth = '0px'
  element.style.opacity = '0'
  // Force a reflow so the browser commits the 0-width state as a real
  // previous frame — otherwise the two style writes coalesce and there's
  // nothing to animate from.
  void element.offsetWidth
  element.style.transition = `max-width ${GROUP_TRANSITION_MS}ms ease-in-out, opacity ${GROUP_TRANSITION_MS}ms ease-in-out`
  element.style.maxWidth = `${targetWidth}px`
  element.style.opacity = '1'
  window.setTimeout(() => {
    // Release the pinned width once settled so later content changes inside
    // the group (e.g. the plan-tool buttons appearing) aren't clipped.
    element.style.maxWidth = ''
    done()
  }, GROUP_TRANSITION_MS)
}

const shrinkToZero = (el: Element, done: () => void) => {
  const element = el as HTMLElement
  element.style.maxWidth = `${element.scrollWidth}px`
  element.style.opacity = '1'
  void element.offsetWidth
  element.style.transition = `max-width ${GROUP_TRANSITION_MS}ms ease-in-out, opacity ${GROUP_TRANSITION_MS}ms ease-in-out`
  element.style.maxWidth = '0px'
  element.style.opacity = '0'
  window.setTimeout(done, GROUP_TRANSITION_MS)
}
</script>

<template>
  <div
    class="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-slate-200/50">
    <ControlButton icon="ph-cube" :title="isEditing ? t('model.editor.exit') : t('model.controls.buttons.reset')"
      :disabled="!isEditing && disabled" @click="isEditing ? $emit('exitEdit') : $emit('resetView')" />

    <Transition :css="false" @enter="growFromZero" @leave="shrinkToZero">
      <div v-if="!isEditing" class="flex items-center gap-2 overflow-hidden">
        <ControlButton :icon="isExploded ? 'ph-arrows-in' : 'ph-arrows-out'" :title="t('model.controls.buttons.focus')"
          :disabled="!selectedRoomId || disabled" :active="isExploded" @click="$emit('toggleExplode')" />

        <ControlButton icon="ph-plus" :title="t('model.controls.buttons.zoomIn')" @click="$emit('zoomIn')"
          :disabled="disabled" />

        <ControlButton icon="ph-minus" :title="t('model.controls.buttons.zoomOut')" @click="$emit('zoomOut')"
          :disabled="disabled" />

        <ControlButton icon="ph-camera" :title="t('model.controls.buttons.panorama')" @click="$emit('togglePanorama')" />

        <ControlButton icon="ph-thermometer" :title="t('model.controls.buttons.temperature')"
          :active="mode.currentMode.value === Mode.TemperatureSensor" @click="mode.changeMode(Mode.TemperatureSensor)" />

        <ControlButton icon="ph-wind" :title="t('model.controls.buttons.airQuality')"
          :active="mode.currentMode.value === Mode.AirQualitySensor" @click="mode.changeMode(Mode.AirQualitySensor)" />

        <ControlButton v-if="canEdit" icon="ph-pencil-simple" :title="t('model.editor.enter')"
          @click="$emit('enterEdit')" />
      </div>
    </Transition>

    <Transition :css="false" @enter="growFromZero" @leave="shrinkToZero">
      <div v-if="isEditing" class="overflow-hidden">
        <!-- $attrs is Record<string, unknown> — vue-tsc can't statically verify
        it satisfies EditToolbar's typed props, though the runtime binding is
        exactly the caller's props/listeners forwarded through unchanged. -->
        <EditToolbar v-bind="$attrs as any" />
      </div>
    </Transition>
  </div>
</template>
