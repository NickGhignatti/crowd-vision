<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TableHeader, MetricContract } from '@/models/table.ts'
import { METRIC_I18N_KEY } from '@/utils/metrics.ts'

defineProps<{
  visible: boolean
  activeHeader: TableHeader | null
  metrics: MetricContract[]
  isFetching: boolean
  position: { top: number; left: number }
}>()

const emit = defineEmits<{
  swap: [metric: MetricContract]
  close: []
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[60]"
        @click.self="emit('close')"
      >
        <div
          class="absolute w-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden origin-top-left"
          :style="{ top: `${position.top}px`, left: `${position.left}px` }"
          @click.stop
        >
          <div class="px-4 py-3 bg-emerald-600 text-white">
            <p class="text-[10px] font-bold uppercase tracking-wider text-emerald-200 mb-0.5">
              {{ t('dashboard.table.currentColumn') }}
            </p>
            <p class="font-bold text-sm truncate">
              {{ t(activeHeader?.label ?? '') }}
            </p>
          </div>

          <div
            v-if="isFetching"
            class="px-4 py-4 flex items-center gap-2 text-slate-400 text-sm"
          >
            <i class="ph-bold ph-spinner animate-spin"></i>
            {{ t('dashboard.table.loadingMetrics') }}
          </div>

          <template v-else>
            <div class="px-4 py-2 bg-slate-50 border-b border-slate-100">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {{ t('dashboard.table.replaceWith') }}
              </p>
            </div>

            <p
              v-if="metrics.length === 0"
              class="px-4 py-3 text-sm text-slate-400 italic"
            >
              {{ t('dashboard.table.noOtherMetrics') }}
            </p>

            <ul v-else class="max-h-52 overflow-y-auto divide-y divide-slate-50">
              <li
                v-for="metric in metrics"
                :key="metric.metricKey"
                @click="emit('swap', metric)"
                class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-pointer group transition-colors"
              >
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-700 group-hover:text-emerald-700 truncate">
                    {{ METRIC_I18N_KEY[metric.metricKey] ? t(METRIC_I18N_KEY[metric.metricKey]!) : metric.label }}
                  </p>
                  <p class="text-xs text-slate-400 truncate">
                    {{ metric.sourceService ?? 'sensor-service' }}
                    <span v-if="metric.unit"> · {{ metric.unit }}</span>
                  </p>
                </div>
                <i class="ph-bold ph-arrows-left-right text-slate-300 group-hover:text-emerald-500 text-sm ml-2 shrink-0 transition-colors"></i>
              </li>
            </ul>

            <div class="px-4 py-2 bg-slate-50 border-t border-slate-100">
              <p class="text-[10px] text-slate-400">
                {{ t('dashboard.table.alreadyInTableNote') }}
              </p>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
