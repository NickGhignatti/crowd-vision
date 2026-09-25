<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MetricContract, TableHeader } from '@/types/dashboard/table.ts'
import { METRIC_I18N_KEY } from '@/utils/dashboard/metrics.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{
  visible: boolean
  activeHeader: TableHeader | null
  metrics: MetricContract[]
  isFetching: boolean
  position: { top: number; left: number }
}>()

const emit = defineEmits<{ swap: [metric: MetricContract]; close: [] }>()

const { t } = useI18n()

const labelOf = (metric: MetricContract) => {
  const key = METRIC_I18N_KEY[metric.kind]
  return key ? t(key) : metric.label
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[60]"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <div
          role="menu"
          class="surface-card absolute w-64 origin-top-left overflow-hidden shadow-lift"
          :style="{ top: `${position.top}px`, left: `${position.left}px` }"
        >
          <div class="bg-primary px-4 py-3 text-on-primary">
            <p class="text-label-header uppercase opacity-80">
              {{ t('dashboard.table.currentColumn') }}
            </p>
            <p class="truncate text-title-sm">{{ t(activeHeader?.label ?? '') }}</p>
          </div>

          <p
            v-if="isFetching"
            class="flex items-center gap-2 px-4 py-4 text-body-sm text-on-surface-variant"
          >
            <BaseIcon name="circle-notch" class="animate-spin" />
            {{ t('dashboard.table.loadingMetrics') }}
          </p>

          <template v-else>
            <p class="px-4 pb-1 pt-3 text-label-header uppercase text-on-surface-variant">
              {{ t('dashboard.table.replaceWith') }}
            </p>
            <p v-if="metrics.length === 0" class="px-4 py-3 text-body-sm text-on-surface-variant">
              {{ t('dashboard.table.noOtherMetrics') }}
            </p>
            <ul v-else class="max-h-52 space-y-0.5 overflow-y-auto px-1.5">
              <li v-for="metric in metrics" :key="metric.kind">
                <button
                  type="button"
                  role="menuitem"
                  class="group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-container-low"
                  @click="emit('swap', metric)"
                >
                  <span class="min-w-0">
                    <span
                      class="block truncate text-body-sm font-semibold group-hover:text-primary"
                    >
                      {{ labelOf(metric) }}
                    </span>
                    <span class="block truncate text-label-stat text-on-surface-variant">
                      {{ metric.source ?? 'telemetry' }}
                      <template v-if="metric.unit"> · {{ metric.unit }}</template>
                    </span>
                  </span>
                  <BaseIcon
                    name="arrows-left-right"
                    class="ml-2 shrink-0 text-outline group-hover:text-primary"
                  />
                </button>
              </li>
            </ul>
            <p class="px-4 pb-3 pt-2 text-[10px] text-on-surface-variant">
              {{ t('dashboard.table.alreadyInTableNote') }}
            </p>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
