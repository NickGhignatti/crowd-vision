<script setup lang="ts">
import RouterLink from '@/components/links/RouterLink.vue'
import RequireAuthModal from '@/components/modals/authentication/RequireAuthModal.vue'

defineProps<{
  to: string
  isLoggedIn: boolean
}>()

defineEmits<{
  click: []
  'locked-click': []
}>()
</script>

<template>
  <RouterLink v-if="isLoggedIn" :to="to" @click="$emit('click')">
    <slot />
  </RouterLink>
  <RequireAuthModal v-else @click="$emit('locked-click')">
    <slot />
  </RequireAuthModal>
</template>
