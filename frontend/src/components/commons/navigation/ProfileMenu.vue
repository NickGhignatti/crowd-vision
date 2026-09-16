<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/auth/useAuth.ts'
import { useAuthDialog } from '@/composables/ui/useAuthDialog.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import PopoverMenu from '@/components/commons/overlays/PopoverMenu.vue'
import MenuItem from '@/components/commons/overlays/MenuItem.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import UserAvatar from '@/components/commons/account/UserAvatar.vue'

const { t } = useI18n()
const { handleLogout } = useAuth()
const authStore = useAuthStore()
const dialog = useAuthDialog()

const run = (action: () => unknown, close: () => void) => {
  close()
  action()
}
</script>

<template>
  <PopoverMenu width="w-60">
    <template #trigger="{ toggle, open }">
      <button
        type="button"
        class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-container-low"
        :aria-expanded="open"
        @click="toggle"
      >
        <UserAvatar :name="authStore.accountName ?? ''" size="sm" />
        <span class="hidden max-w-40 truncate text-title-sm lg:inline">
          {{ authStore.accountName }}
        </span>
        <BaseIcon
          name="caret-down"
          class="text-outline transition-transform"
          :class="open && 'rotate-180'"
        />
      </button>
    </template>

    <template #default="{ close }">
      <div class="mb-1 rounded-xl bg-surface-container-low px-3 py-2.5">
        <p class="text-label-header uppercase text-on-surface-variant">
          {{ t('authentication.signedInAs') }}
        </p>
        <p class="truncate text-title-sm">{{ authStore.accountName }}</p>
      </div>
      <div>
        <MenuItem icon="gear" @select="run(() => dialog.open('settings'), close)">
          {{ t('authentication.settings') }}
        </MenuItem>
        <MenuItem icon="sign-out" danger @select="run(handleLogout, close)">
          {{ t('authentication.logout') }}
        </MenuItem>
      </div>
    </template>
  </PopoverMenu>
</template>
