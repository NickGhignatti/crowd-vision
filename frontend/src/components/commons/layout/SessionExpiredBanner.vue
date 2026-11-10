<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSessionExpiry } from '@/composables/authentication/sessionExpiry.ts'
import { useAuthDialog } from '@/composables/authentication/useAuthDialog.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

const { t } = useI18n()
const { sessionExpired, dismiss } = useSessionExpiry()
const { open } = useAuthDialog()
</script>

<template>
  <div
    v-if="sessionExpired"
    role="alert"
    class="flex items-center gap-3 border-b border-outline-variant/40 bg-surface-container px-4 py-2 md:px-margin"
  >
    <BaseIcon name="warning-circle" class="text-lg text-error" />
    <p class="flex-1 text-body-sm text-on-surface">{{ t('authentication.sessionExpired') }}</p>
    <BaseButton variant="ghost" size="sm" @click="open('login')">
      {{ t('authentication.login') }}
    </BaseButton>
    <IconButton icon="x" :label="t('commons.dismiss')" size="sm" @click="dismiss" />
  </div>
</template>
