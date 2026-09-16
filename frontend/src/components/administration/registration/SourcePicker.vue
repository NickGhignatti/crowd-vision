<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ disabled: boolean }>()

const emit = defineEmits<{ json: [file: File]; plans: [] }>()

// One tile per format the upload understands; a new format adds a tile and a floorplan reader.
const FORMATS = [
  { key: 'json', icon: 'file-code' },
  { key: 'svg', icon: 'blueprint' },
  { key: 'dxf', icon: 'compass-tool' },
  { key: 'pdf', icon: 'file-pdf' },
] as const

const { t } = useI18n()
const jsonInput = ref<HTMLInputElement | null>(null)

const pick = (key: (typeof FORMATS)[number]['key']) =>
  key === 'json' ? jsonInput.value?.click() : emit('plans')

const onJson = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('json', file)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
    <button
      v-for="format in FORMATS"
      :key="format.key"
      type="button"
      :disabled="disabled"
      class="group flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-low px-3 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
      @click="pick(format.key)"
    >
      <BaseIcon
        :name="format.icon"
        class="text-3xl text-on-surface-variant transition-colors group-hover:text-primary"
      />
      <span class="text-body-sm font-semibold">{{
        t(`model.register.formats.${format.key}`)
      }}</span>
      <span class="text-label-stat text-on-surface-variant">
        {{ t(`model.register.formats.${format.key}Hint`) }}
      </span>
    </button>
    <input ref="jsonInput" type="file" accept=".json" class="hidden" @change="onJson" />
  </div>
</template>
