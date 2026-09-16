<script setup lang="ts">
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'
import { statusTone } from '@/helpers/status.ts'
import StatusDot from '@/components/commons/base/StatusDot.vue'

defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()
</script>

<template>
  <div class="flex items-center gap-2.5">
    <StatusDot :tone="statusTone(row.status)" />
    <div class="min-w-0">
      <p class="truncate text-mono-metric text-on-surface">{{ value }}</p>
      <p v-if="row.roomId !== value" class="truncate text-label-stat text-on-surface-variant">
        {{ row.roomId }}
      </p>
    </div>
  </div>
</template>
