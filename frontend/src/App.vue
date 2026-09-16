<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { socket } from '@/services/socket'
import { useAuthStore } from '@/stores/authentication'
import { useNotificationStore } from '@/stores/notification.ts'
import { useSessionKeepAlive } from '@/composables/auth/useSessionKeepAlive'
import PushNotificationPrompt from '@/components/commons/notifications/PushNotificationPrompt.vue'
import ChatWidget from '@/components/commons/chat/ChatWidget.vue'
import AuthDialogs from '@/components/commons/account/AuthDialogs.vue'

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

useSessionKeepAlive()

const loadPreferences = () =>
  notificationStore.fetchAccountNotificationPreference(authStore.accountName ?? '')

// The bell filters breaches against these, so a switch flipped in another tab applies on return.
const refreshPreferences = () => {
  if (authStore.isAuthenticated) void loadPreferences()
}

onMounted(() => {
  authStore.hydrate()
  window.addEventListener('focus', refreshPreferences)
})

// The handshake needs the auth cookie, so connect only once authenticated — and only after the
// preferences load, or the first breaches would be judged against an empty map and hidden.
watch(
  () => authStore.isAuthenticated,
  async (authed) => {
    if (!authed) {
      socket.disconnect()
      return
    }
    await loadPreferences()
    if (authStore.isAuthenticated) socket.connect()
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('focus', refreshPreferences)
  socket.disconnect()
})
</script>

<template>
  <RouterView />
  <AuthDialogs />
  <PushNotificationPrompt />
  <ChatWidget />
</template>
