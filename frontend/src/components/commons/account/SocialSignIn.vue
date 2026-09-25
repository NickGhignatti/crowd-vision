<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/commons/base/BaseButton.vue'

defineEmits<{ google: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3" role="separator">
      <span class="h-px flex-1 bg-outline-variant" />
      <span class="text-label-header uppercase text-on-surface-variant">
        {{ t('authentication.or') }}
      </span>
      <span class="h-px flex-1 bg-outline-variant" />
    </div>
    <BaseButton icon="google-logo" size="lg" block @click="$emit('google')">
      {{ t('authentication.continueWithGoogle') }}
    </BaseButton>
  </div>
</template>
