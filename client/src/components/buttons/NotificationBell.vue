<script setup lang="ts">
import { socketState } from '@/services/socket'
import { ref } from 'vue'
import NotificationDropdown from '@/components/menus/NotificationDropdown.vue'

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

    <NotificationDropdown v-if="isOpen" />
  </div>
</template>
