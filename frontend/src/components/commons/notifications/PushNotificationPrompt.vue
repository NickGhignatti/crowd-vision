<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useWebPushNotifications } from '@/composables/notification/useWebPushNotifications.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'

const { t } = useI18n()
const { permission, subscribe, isSupported } = useWebPushNotifications()
const authStore = useAuthStore()

const enable = () => subscribe(authStore.accountName ?? undefined)
const dismiss = () => (permission.value = 'denied')
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="isSupported && permission === 'default'"
      role="dialog"
      :aria-label="t('notifications.title')"
      class="surface-card fixed bottom-6 right-6 z-[90] flex w-[calc(100vw-3rem)] max-w-xs flex-col gap-3 rounded-3xl p-5 shadow-lift"
    >
      <div class="flex items-start gap-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary"
        >
          <BaseIcon name="bell-ringing" />
        </span>
        <div>
          <p class="text-title-sm">{{ t('notifications.title') }}</p>
          <p class="text-body-sm text-on-surface-variant">{{ t('notifications.description') }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <BaseButton size="sm" variant="ghost" @click="dismiss">{{ t('commons.later') }}</BaseButton>
        <BaseButton size="sm" variant="primary" @click="enable">
          {{ t('commons.enable') }}
        </BaseButton>
      </div>
    </div>
  </Transition>
</template>
