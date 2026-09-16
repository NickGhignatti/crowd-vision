<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/authentication/useAuth.ts'
import { useAuthDialog } from '@/composables/authentication/useAuthDialog.ts'
import { useAuthStore } from '@/stores/authentication/authentication.ts'
import NavLinks from '@/components/commons/layout/NavLinks.vue'
import GuestActions from '@/components/commons/navigation/GuestActions.vue'
import UserAvatar from '@/components/commons/account/UserAvatar.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'

const emit = defineEmits<{ navigate: [] }>()

const { t } = useI18n()
const { isLoggedIn, handleLogout } = useAuth()
const authStore = useAuthStore()
const dialog = useAuthDialog()

const openSettings = () => {
  dialog.open('settings')
  emit('navigate')
}
</script>

<template>
  <div class="space-y-4 bg-surface-container-lowest px-4 pb-5 pt-2">
    <NavLinks vertical @navigate="emit('navigate')" />

    <div class="rounded-2xl bg-surface-container-low p-3">
      <div v-if="isLoggedIn" class="space-y-3">
        <div class="flex items-center gap-3">
          <UserAvatar :name="authStore.accountName ?? ''" size="md" />
          <div class="min-w-0">
            <p class="text-label-header uppercase text-on-surface-variant">
              {{ t('authentication.signedInAs') }}
            </p>
            <p class="truncate text-title-sm">{{ authStore.accountName }}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <BaseButton icon="gear" block @click="openSettings">
            {{ t('authentication.settings') }}
          </BaseButton>
          <BaseButton icon="sign-out" variant="tonal" block @click="handleLogout">
            {{ t('authentication.logout') }}
          </BaseButton>
        </div>
      </div>
      <GuestActions v-else stacked @select="emit('navigate')" />
    </div>
  </div>
</template>
