<script setup lang="ts">
import { socketState } from '@/services/socket'
import NotificationItem from '@/components/cards/NotificationCard.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const tr = (key: string, fallback: string) => {
  const translated = t(key)
  return translated === key ? fallback : translated
}
</script>

<template>
  <div
    class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden"
  >
    <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
      <h3 class="font-semibold text-slate-800">{{ tr('notifications.dropdown.title', 'Notifications') }}</h3>
      <span v-if="socketState.connected" class="text-xs text-slate-500"
        >🟢 {{ tr('notifications.dropdown.live', 'Live') }}</span
      >
      <span v-else class="text-xs text-red-500"
        >🔴 {{ tr('notifications.dropdown.offline', 'Offline') }}</span
      >
    </div>

    <div class="max-h-96 overflow-y-auto">
      <div
        v-if="socketState.notifications.length === 0"
        class="p-4 text-center text-slate-500 text-sm"
      >
        {{ tr('notifications.dropdown.empty', 'No new notifications') }}
      </div>
      <NotificationItem
        v-for="note in socketState.notifications"
        :key="note.id"
        :notification="note"
      />
    </div>
  </div>
</template>
