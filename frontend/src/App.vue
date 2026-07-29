<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { socket } from '@/services/socket'
import { useAuthStore } from '@/stores/authentication'
import PushNotificationModal from '@/components/modals/PushNotificationModal.vue'
import ChatWidget from '@/components/layouts/ChatWidget.vue'

const authStore = useAuthStore()

onMounted(() => {
  authStore.hydrate()
})

// The socket handshake requires the auth cookie, so only connect once the user
// is authenticated; drop the connection on logout. immediate covers the initial
// state (and the false→true flip when hydrate() resolves from the cookie).
watch(
  () => authStore.isAuthenticated,
  (authed) => (authed ? socket.connect() : socket.disconnect()),
  { immediate: true },
)

onUnmounted(() => {
  socket.disconnect()
})
</script>

<template>
  <div class="relative min-h-screen">
    <router-view />

    <PushNotificationModal />
    <ChatWidget />
  </div>
</template>
