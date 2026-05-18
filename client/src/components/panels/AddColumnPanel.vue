<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MetricContract } from '@/models/table.ts'
import { METRIC_I18N_KEY } from '@/utils/metrics.ts'

defineProps<{
  metrics: MetricContract[]
  isFetching: boolean
}>()

const emit = defineEmits<{
  select: [metric: MetricContract]
  close: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="border-b border-slate-200 bg-slate-50 p-4 shrink-0">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
        <i class="ph-bold ph-plus-circle text-emerald-600 text-base"></i>
        {{ t('dashboard.table.addColumn') }}
      </h3>
      <button
        @click="emit('close')"
        class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/50 transition-colors"
      >
        <i class="ph-bold ph-x text-sm"></i>
      </button>
    </div>

    <div v-if="isFetching" class="flex items-center gap-2 text-slate-400 text-sm">
      <i class="ph-bold ph-spinner animate-spin"></i>
      {{ t('dashboard.table.loadingMetrics') }}
    </div>

    <p v-else-if="metrics.length === 0" class="text-sm text-slate-400 italic">
      {{ t('dashboard.table.allMetricsDisplayed') }}
    </p>

    <div v-else class="flex flex-wrap gap-2">
      <button
        v-for="metric in metrics"
        :key="metric.metricKey"
        @click="emit('select', metric)"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 hover:border-emerald-400 transition-all"
      >
        <i class="ph-bold ph-plus text-[10px]"></i>
        {{ METRIC_I18N_KEY[metric.metricKey] ? t(METRIC_I18N_KEY[metric.metricKey]!) : metric.label }}
        <span v-if="metric.unit" class="text-emerald-500 font-normal">({{ metric.unit }})</span>
      </button>
    </div>
  </div>
</template>
