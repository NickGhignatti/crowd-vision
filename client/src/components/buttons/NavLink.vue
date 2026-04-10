<script setup lang="ts">
import NavbarLink from '@/components/link/NavbarLink.vue'
import RequireLogin from '@/components/modals/RequireLogin.vue'

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
  <RequireLogin v-else @click="$emit('locked-click')">
    <slot />
  </RequireLogin>
</template>
