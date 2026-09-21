<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const { t } = useI18n()
const { changes, hasChanges, isSaving, saveError, save, discard } = useSensorEditor()

const confirmDiscard = () => {
  if (window.confirm(t('model.sensors.discardConfirm'))) discard()
}
</script>

<template>
  <div
    role="status"
    class="surface-card flex items-center gap-3 rounded-full bg-surface-container-lowest/90 py-1.5 pl-4 pr-1.5 shadow-lift backdrop-blur-md"
  >
    <BaseIcon name="broadcast" class="text-primary" />
    <span class="text-sm font-medium text-on-surface">
      {{ t('model.sensors.unsaved', changes) }}
    </span>
    <span v-if="saveError" class="text-sm text-error">{{ t('model.sensors.saveFailed') }}</span>

    <button
      type="button"
      class="rounded-full px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
      :disabled="!hasChanges || isSaving"
      @click="confirmDiscard"
    >
      {{ t('model.sensors.discard') }}
    </button>
    <button
      type="button"
      class="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-container disabled:opacity-50"
      :disabled="!hasChanges || isSaving"
      @click="save"
    >
      {{ isSaving ? t('model.sensors.saving') : t('model.sensors.save') }}
    </button>
  </div>
</template>
