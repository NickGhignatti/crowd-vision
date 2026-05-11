<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { socket } from '@/services/socket'
import { useAuthStore } from '@/stores/authentication'
import PushNotificationModal from '@/components/modals/PushNotificationModal.vue'
import ChatWidget from '@/components/layouts/ChatWidget.vue'

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

    <PushNotificationModal />
    <ChatWidget />
  </div>
</template>
