<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { socket } from '@/services/socket'

onMounted(() => {
  socket.connect()
})

onUnmounted(() => {
  socket.disconnect()
})
</script>

<template>
  <router-view />
</template>
