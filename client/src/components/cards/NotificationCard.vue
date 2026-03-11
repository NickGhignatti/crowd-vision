<script setup lang="ts">
import type { Notification } from '@/services/socket'

defineProps<{
  notification: Notification
}>()
</script>

<template>
  <div class="px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex gap-3">
    <div class="mt-1">
      <div
        class="w-2 h-2 rounded-full"
        :class="notification.type === 'alert' ? 'bg-red-500' : 'bg-blue-500'"
      ></div>
    </div>
    <div>
      <p class="text-sm text-slate-800">{{ notification.message }}</p>
      <p class="text-xs text-slate-400 mt-1">
        {{ new Date(notification.timestamp).toLocaleTimeString() }}
      </p>
    </div>
  </div>
</template>
