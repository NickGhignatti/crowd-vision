<script setup lang="ts">
import { usePush } from '@/composables/usePush.ts'

import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { permission, subscribe, isSupported } = usePush()

const enableAlerts = async () => {
  await subscribe()
}

const dismiss = () => {
  permission.value = 'denied'
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="isSupported && permission === 'default'"
      class="fixed bottom-6 right-6 z-[9999] flex w-full max-w-xs flex-col gap-3 rounded-lg border-l-4 border-emerald-500 bg-white p-4 shadow-xl"
    >
      <div class="flex items-start gap-3">
        <span class="text-2xl">🔔</span>
        <div class="text-sm">
          <strong class="mb-1 block font-semibold text-gray-800">{{
            t('notifications.title')
          }}</strong>
          <p class="m-0 leading-snug text-gray-500">
            {{ t('notifications.description') }}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button
          @click="enableAlerts"
          class="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
        >
          {{ t('commons.enable') }}
        </button>

        <button
          @click="dismiss"
          class="rounded-md bg-transparent px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          {{ t('commons.later') }}
        </button>
      </div>
    </div>
  </Transition>
</template>
