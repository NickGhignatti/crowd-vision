<script setup lang="ts">
import { socketState } from '@/services/socket'

import { ref } from 'vue'

const isOpen = ref(false)

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    socketState.unreadCount = 0
  }
}
</script>

<template>
  <div class="relative">
    <button
      @click="toggleDropdown"
      class="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
      </svg>

      <span
        v-if="socketState.unreadCount > 0"
        class="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full"
      >
        {{ socketState.unreadCount }}
      </span>
    </button>

    <div
      v-if="isOpen"
      class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden"
    >
      <div
        class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center"
      >
        <h3 class="font-semibold text-slate-800">Notifications</h3>
        <span class="text-xs text-slate-500" v-if="socketState.connected">🟢 Live</span>
        <span class="text-xs text-red-500" v-else>🔴 Offline</span>
      </div>

      <div class="max-h-96 overflow-y-auto">
        <div
          v-if="socketState.notifications.length === 0"
          class="p-4 text-center text-slate-500 text-sm"
        >
          No new notifications
        </div>

        <div
          v-for="note in socketState.notifications"
          :key="note.id"
          class="px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex gap-3"
        >
          <div class="mt-1">
            <div v-if="note.type === 'alert'" class="w-2 h-2 rounded-full bg-red-500"></div>
            <div v-else class="w-2 h-2 rounded-full bg-blue-500"></div>
          </div>

          <div>
            <p class="text-sm text-slate-800">{{ note.message }}</p>
            <p class="text-xs text-slate-400 mt-1">
              {{ new Date(note.timestamp).toLocaleTimeString() }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
