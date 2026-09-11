<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NotificationType } from '@/models/notification.ts'
import { METRIC_DISPLAY } from '@/config/metricDisplay.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import { useNotificationStore } from '@/stores/notification.ts'

const props = withDefaults(defineProps<{ domainName: string; size?: 'md' | 'sm' }>(), {
  size: 'md',
})

const { t } = useI18n()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const metrics = Object.values(NotificationType)

const isOn = (metric: NotificationType) => notificationStore.isSubscribed(props.domainName, metric)

const label = (metric: NotificationType) =>
  `${t(`domains.administration.alerts.${metric}`)} · ${t(`domains.administration.alerts.${isOn(metric) ? 'on' : 'off'}`)}`

const toggle = (metric: NotificationType) =>
  notificationStore.handleNotificationSubscription(
    authStore.accountName || '',
    props.domainName,
    metric,
  )
</script>

<template>
  <div
    @click.stop
    class="flex items-center rounded-full"
    :class="
      size === 'md'
        ? 'gap-1 p-1 bg-slate-100'
        : 'gap-0.5 p-[3px] bg-slate-50 border border-slate-100'
    "
  >
    <button
      v-for="metric in metrics"
      :key="metric"
      type="button"
      @click="toggle(metric)"
      :title="label(metric)"
      :aria-label="label(metric)"
      :aria-pressed="isOn(metric)"
      class="flex items-center justify-center rounded-full transition-all duration-200"
      :class="[
        size === 'md' ? 'w-7 h-7 text-base' : 'w-6 h-6 text-sm',
        isOn(metric)
          ? 'bg-white text-emerald-600 shadow-sm'
          : 'text-slate-400 hover:text-slate-600',
      ]"
    >
      <i class="ph-bold" :class="METRIC_DISPLAY[metric]?.icon"></i>
    </button>
  </div>
</template>
