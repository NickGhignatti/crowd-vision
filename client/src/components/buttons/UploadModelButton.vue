<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

withDefaults(
  defineProps<{
    isUploading?: boolean
    title?: string
    size?: 'sm' | 'md'
  }>(),
  {
    isUploading: false,
    title: '',
    size: 'md',
  },
)

defineEmits(['click'])
</script>

<template>
  <button
    @click.stop="$emit('click', $event)"
    :title="title || t('model.controls.uploadJson')"
    :disabled="isUploading"
    class="flex items-center justify-center rounded-lg border bg-white shadow-sm transition-all duration-300 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 hover:scale-105"
    :class="
      size === 'sm' ? 'p-1.5 rounded-md border-slate-100 bg-slate-50' : 'p-2 border-slate-200'
    "
  >
    <i
      v-if="isUploading"
      class="ph-bold ph-spinner animate-spin"
      :class="size === 'sm' ? 'text-md' : 'text-lg'"
    ></i>
    <i
      v-else
      class="ph-bold ph-upload-simple text-slate-500 hover:text-emerald-600"
      :class="size === 'sm' ? 'text-md' : 'text-lg'"
    ></i>
  </button>
</template>
