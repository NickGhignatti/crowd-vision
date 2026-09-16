<script setup lang="ts">
import { useAuthDialog } from '@/composables/ui/useAuthDialog.ts'
import LogInModal from '@/components/commons/account/LogInModal.vue'
import SignUpModal from '@/components/commons/account/SignUpModal.vue'
import AccountSettingsModal from '@/components/commons/account/AccountSettingsModal.vue'

const { active, open, close } = useAuthDialog()
</script>

<template>
  <LogInModal :open="active === 'login'" @close="close" @switch-to-signup="open('signup')" />
  <SignUpModal :open="active === 'signup'" @close="close" @switch-to-login="open('login')" />
  <AccountSettingsModal :open="active === 'settings'" @close="close" />
</template>
