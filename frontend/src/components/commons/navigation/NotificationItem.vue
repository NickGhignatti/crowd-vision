<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationListItem as Notification } from '@/types/commons/notification.ts'
import { SEVERITY_TONE } from '@/utils/commons/notification.ts'
import StatusDot from '@/components/commons/base/StatusDot.vue'

const props = defineProps<{ notification: Notification }>()

const { locale } = useI18n()
const time = computed(() =>
  new Date(props.notification.timestamp).toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
  }),
)
</script>

<template>
  <div class="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-container-low">
    <StatusDot class="mt-1.5" :tone="SEVERITY_TONE[notification.type]" />
    <div class="min-w-0 flex-1">
      <p v-if="notification.title" class="truncate text-body-sm font-semibold">
        {{ notification.title }}
      </p>
      <p class="text-body-sm text-on-surface">{{ notification.message }}</p>
      <p class="mt-0.5 text-label-stat text-on-surface-variant">
        <span v-if="notification.domainName">{{ notification.domainName }} · </span>{{ time }}
      </p>
    </div>
  </div>
</template>
