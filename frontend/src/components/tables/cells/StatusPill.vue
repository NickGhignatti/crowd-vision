<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStatusColor } from '@/helpers/status.ts'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'

// Coloured dot + translated label for status-key metrics.
const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const { t } = useI18n()
const key = computed(() => String(props.value ?? ''))
const colorClass = computed(() => getStatusColor(key.value))
</script>

<template>
  <span class="inline-flex items-center gap-2" :class="colorClass">
    <span class="w-2 h-2 rounded-full bg-current"></span>
    <span>{{ t(key) }}</span>
  </span>
</template>
