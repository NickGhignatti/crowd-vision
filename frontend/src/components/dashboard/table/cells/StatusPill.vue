<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MetricDisplay } from '@/config/metricDisplay.ts'
import type { TableBody } from '@/models/table.ts'
import type { Tone } from '@/helpers/tone.ts'
import { statusTone } from '@/helpers/status.ts'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'

const props = defineProps<{ display: MetricDisplay; value: unknown; row: TableBody }>()

const ICON: Partial<Record<Tone, string>> = {
  neutral: 'moon',
  success: 'check-circle',
  warning: 'warning',
  danger: 'warning-octagon',
}

const { t } = useI18n()
const key = computed(() => String(props.value ?? ''))
const tone = computed(() => statusTone(key.value))
</script>

<template>
  <BaseBadge :tone="tone" :icon="ICON[tone]">{{ t(key) }}</BaseBadge>
</template>
