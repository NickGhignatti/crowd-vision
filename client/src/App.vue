<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { socket } from '@/services/socket'
import { useAuthStore } from '@/stores/authentication'
import PushNotificationToast from '@/components/PushNotificationToast.vue'
import ChatWidget from '@/components/ChatWidget.vue'

const authStore = useAuthStore()

onMounted(() => {
  socket.connect()
  authStore.hydrate()
})

onUnmounted(() => {
  socket.disconnect()
})
</script>

<template>
  <div class="relative min-h-screen">
    <router-view />

    <PushNotificationToast />
    <ChatWidget />
  </div>
</template>
