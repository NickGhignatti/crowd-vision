<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NotificationType } from '@/types/commons/notification.ts'
import { METRIC_DISPLAY } from '@/utils/dashboard/metricDisplay.ts'
import { useAuthStore } from '@/stores/authentication/authentication.ts'
import { useNotificationStore } from '@/stores/commons/notification.ts'
import PopoverMenu from '@/components/commons/overlays/PopoverMenu.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import ToggleSwitch from '@/components/commons/base/ToggleSwitch.vue'

const props = withDefaults(defineProps<{ domainName: string; size?: 'sm' | 'md' }>(), {
  size: 'md',
})

const METRICS = Object.values(NotificationType)

const { t } = useI18n()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const isOn = (metric: NotificationType) => notificationStore.isSubscribed(props.domainName, metric)
const onCount = computed(() => METRICS.filter(isOn).length)

const toggle = (metric: NotificationType) =>
  notificationStore.handleNotificationSubscription(
    authStore.accountName ?? '',
    props.domainName,
    metric,
  )
</script>

<template>
  <PopoverMenu width="w-64" @click.stop>
    <template #trigger="{ toggle: toggleMenu, open }">
      <IconButton
        :icon="onCount > 0 ? 'bell-ringing' : 'bell-slash'"
        :size="size"
        :active="open"
        :label="t('domains.administration.alerts.bell', { on: onCount, total: METRICS.length })"
        @click="toggleMenu"
      />
    </template>

    <div class="flex items-baseline justify-between px-2.5 pb-2 pt-1.5">
      <span class="truncate text-label-header uppercase text-on-surface-variant">
        {{ domainName }}
      </span>
      <span class="text-label-stat text-on-surface-variant"
        >{{ onCount }}/{{ METRICS.length }}</span
      >
    </div>

    <label
      v-for="metric in METRICS"
      :key="metric"
      class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-container-low"
    >
      <span
        class="flex size-7 items-center justify-center rounded-md"
        :class="isOn(metric) ? 'bg-primary/10 text-primary' : 'bg-surface-container text-outline'"
      >
        <BaseIcon :name="METRIC_DISPLAY[metric]?.icon ?? 'bell'" />
      </span>
      <span class="flex-1 text-body-sm font-medium">
        {{ t(`domains.administration.alerts.names.${metric}`) }}
      </span>
      <ToggleSwitch
        size="sm"
        :model-value="isOn(metric)"
        :label="t(`domains.administration.alerts.${metric}`)"
        @update:model-value="toggle(metric)"
      />
    </label>
  </PopoverMenu>
</template>
