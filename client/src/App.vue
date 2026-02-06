<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { socket } from '@/services/socket'
import PushNotificationToast from '@/components/PushNotificationToast.vue'

onMounted(() => {
  socket.connect()
})

onUnmounted(() => {
  socket.disconnect()
})
</script>

<template>
  <div class="relative min-h-screen">
    <router-view />

    <PushNotificationToast />
  </div>
</template>
