<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { socketState } from '@/services/socket'
import PopoverMenu from '@/components/commons/overlays/PopoverMenu.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import StatusDot from '@/components/commons/base/StatusDot.vue'
import NotificationItem from '@/components/commons/navigation/NotificationItem.vue'

const { t } = useI18n()
const open = ref(false)

watch(open, (isOpen) => {
  if (isOpen) socketState.unreadCount = 0
})
</script>

<template>
  <PopoverMenu v-model:open="open" width="w-80">
    <template #trigger="{ toggle }">
      <IconButton
        icon="bell"
        :label="t('notifications.dropdown.title')"
        :active="open"
        @click="toggle"
      >
        <span
          v-if="socketState.unreadCount > 0"
          class="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-4 text-on-error ring-2 ring-surface-container-lowest"
        >
          {{ socketState.unreadCount > 9 ? '9+' : socketState.unreadCount }}
        </span>
      </IconButton>
    </template>

    <div class="flex items-center justify-between px-2.5 pb-2 pt-1.5">
      <h3 class="text-title-sm">{{ t('notifications.dropdown.title') }}</h3>
      <span
        class="inline-flex items-center gap-1.5 text-label-stat"
        :class="socketState.connected ? 'text-primary' : 'text-error'"
      >
        <StatusDot :tone="socketState.connected ? 'primary' : 'danger'" />
        {{
          socketState.connected
            ? t('notifications.dropdown.live')
            : t('notifications.dropdown.offline')
        }}
      </span>
    </div>

    <div class="max-h-96 space-y-0.5 overflow-y-auto">
      <EmptyState
        v-if="socketState.notifications.length === 0"
        compact
        icon="bell-slash"
        :title="t('notifications.dropdown.empty')"
      />
      <NotificationItem
        v-for="notification in socketState.notifications"
        :key="notification.id"
        :notification="notification"
      />
    </div>
  </PopoverMenu>
</template>
