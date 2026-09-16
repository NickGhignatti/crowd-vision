<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MetricContract } from '@/types/dashboard/table.ts'
import { METRIC_I18N_KEY } from '@/utils/dashboard/metrics.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ metrics: MetricContract[]; isFetching: boolean; failed?: boolean }>()

const emit = defineEmits<{ select: [metric: MetricContract]; close: []; retry: [] }>()

const { t } = useI18n()

const labelOf = (metric: MetricContract) => {
  const key = METRIC_I18N_KEY[metric.kind]
  return key ? t(key) : metric.label
}
</script>

<template>
  <section class="surface-card space-y-3 p-4">
    <header class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-title-sm">
        <BaseIcon name="plus-circle" class="text-primary" />
        {{ t('dashboard.table.addColumn') }}
      </h3>
      <IconButton icon="x" size="sm" :label="t('commons.close')" @click="emit('close')" />
    </header>

    <p v-if="isFetching" class="flex items-center gap-2 text-body-sm text-on-surface-variant">
      <BaseIcon name="circle-notch" class="animate-spin" />
      {{ t('dashboard.table.loadingMetrics') }}
    </p>

    <FormMessage v-else-if="failed">
      <span class="flex items-center justify-between gap-3">
        {{ t('dashboard.table.metricsUnavailable') }}
        <BaseButton size="sm" @click="emit('retry')">{{ t('dashboard.table.retry') }}</BaseButton>
      </span>
    </FormMessage>

    <p v-else-if="metrics.length === 0" class="text-body-sm text-on-surface-variant">
      {{ t('dashboard.table.allMetricsDisplayed') }}
    </p>

    <div v-else class="flex flex-wrap gap-2">
      <button
        v-for="metric in metrics"
        :key="metric.kind"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3.5 py-1.5 text-body-sm font-medium text-primary transition-colors hover:bg-primary/15"
        @click="emit('select', metric)"
      >
        <BaseIcon name="plus" />
        {{ labelOf(metric) }}
        <span v-if="metric.unit" class="opacity-70">({{ metric.unit }})</span>
      </button>
    </div>
  </section>
</template>
