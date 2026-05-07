<script setup lang="ts">
import NavbarLink from '@/components/links/NavbarLink.vue'
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
  <NavbarLink v-if="isLoggedIn" :to="to" @click="$emit('click')">
    <slot />
  </NavbarLink>
  <RequireAuthModal v-else @click="$emit('locked-click')">
    <slot />
  </RequireAuthModal>
</template>
