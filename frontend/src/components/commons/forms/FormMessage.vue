<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

type MessageTone = 'error' | 'success' | 'warning' | 'info'

withDefaults(defineProps<{ tone?: MessageTone; dismissible?: boolean }>(), { tone: 'error' })

defineEmits<{ dismiss: [] }>()

const { t } = useI18n()

const STYLE: Record<MessageTone, { icon: string; class: string }> = {
  error: { icon: 'warning-circle', class: 'bg-error-container text-on-error-container' },
  success: { icon: 'check-circle', class: 'bg-secondary-container text-on-secondary-container' },
  warning: { icon: 'warning', class: 'bg-warning-container text-on-warning-container' },
  info: { icon: 'info', class: 'bg-tertiary-container text-on-tertiary-container' },
}
</script>

<template>
  <div
    :role="tone === 'error' ? 'alert' : 'status'"
    class="flex items-start gap-2 rounded-lg px-3 py-2 text-body-sm"
    :class="STYLE[tone].class"
  >
    <BaseIcon :name="STYLE[tone].icon" class="mt-0.5 shrink-0 text-base" />
    <div class="min-w-0 flex-1"><slot /></div>
    <button
      v-if="dismissible"
      type="button"
      class="shrink-0 opacity-70 hover:opacity-100"
      :aria-label="t('commons.dismiss')"
      @click="$emit('dismiss')"
    >
      <BaseIcon name="x" />
    </button>
  </div>
</template>
