<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const isOn = (metric: NotificationType) => notificationStore.isSubscribed(props.domainName, metric)

const switchedOn = computed(() => metrics.filter(isOn).length)

const label = (metric: NotificationType) =>
  `${t(`domains.administration.alerts.${metric}`)} · ${t(`domains.administration.alerts.${isOn(metric) ? 'on' : 'off'}`)}`

const summary = computed(() =>
  t('domains.administration.alerts.bell', { on: switchedOn.value, total: metrics.length }),
)

const toggle = (metric: NotificationType) =>
  notificationStore.handleNotificationSubscription(
    authStore.accountName || '',
    props.domainName,
    metric,
  )

const close = () => {
  isOpen.value = false
}

// The menu escapes its card, so only a document-level listener can catch a click past it.
const closeOnOutsideClick = (event: PointerEvent) => {
  if (!root.value?.contains(event.target as Node)) close()
}
const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsideClick)
  document.addEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsideClick)
  document.removeEventListener('keydown', closeOnEscape)
})
</script>

<template>
  <div ref="root" @click.stop class="relative">
    <button
      type="button"
      @click="isOpen = !isOpen"
      :title="summary"
      :aria-label="summary"
      :aria-expanded="isOpen"
      class="relative flex items-center justify-center rounded-full transition-colors duration-200"
      :class="[
        size === 'md' ? 'w-9 h-9' : 'w-8 h-8',
        isOpen
          ? 'bg-slate-200 text-slate-700'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
      ]"
    >
      <i
        class="ph"
        :class="[
          switchedOn > 0 ? 'ph-bell' : 'ph-bell-slash',
          size === 'md' ? 'text-xl' : 'text-lg',
        ]"
      ></i>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-show="isOpen"
        class="absolute right-0 top-full z-30 mt-2 w-56 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
      >
        <div class="flex items-baseline justify-between px-2.5 pt-1.5 pb-2">
          <span class="truncate text-xs font-bold tracking-wide text-slate-700">
            {{ domainName }}
          </span>
          <span class="shrink-0 pl-2 text-xs font-semibold text-slate-400">
            {{ switchedOn }}/{{ metrics.length }}
          </span>
        </div>

        <button
          v-for="metric in metrics"
          :key="metric"
          type="button"
          @click="toggle(metric)"
          :title="label(metric)"
          :aria-pressed="isOn(metric)"
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
            :class="isOn(metric) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'"
          >
            <i class="ph-bold text-base" :class="METRIC_DISPLAY[metric]?.icon"></i>
          </span>
          <span
            class="flex-1 text-sm font-semibold"
            :class="isOn(metric) ? 'text-slate-700' : 'text-slate-500'"
          >
            {{ t(`domains.administration.alerts.names.${metric}`) }}
          </span>
          <span
            class="relative h-[18px] w-8 shrink-0 rounded-full transition-colors"
            :class="isOn(metric) ? 'bg-emerald-500' : 'bg-slate-200'"
          >
            <span
              class="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all"
              :class="isOn(metric) ? 'left-[16px]' : 'left-[2px]'"
            ></span>
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
