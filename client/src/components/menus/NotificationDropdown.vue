<script setup lang="ts">
import { socketState } from '@/services/socket'
import NotificationItem from '@/components/cards/NotificationCard.vue'
</script>

<template>
  <div
    class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden"
  >
    <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
      <h3 class="font-semibold text-slate-800">Notifications</h3>
      <span v-if="socketState.connected" class="text-xs text-slate-500">🟢 Live</span>
      <span v-else class="text-xs text-red-500">🔴 Offline</span>
    </div>

    <div class="max-h-96 overflow-y-auto">
      <div
        v-if="socketState.notifications.length === 0"
        class="p-4 text-center text-slate-500 text-sm"
      >
        No new notifications
      </div>
      <NotificationItem
        v-for="note in socketState.notifications"
        :key="note.id"
        :notification="note"
      />
    </div>
  </div>
</template>
