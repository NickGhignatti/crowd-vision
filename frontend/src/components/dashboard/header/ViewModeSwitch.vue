<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SegmentedControl from '@/components/commons/base/SegmentedControl.vue'

export type DashboardView = 'table' | 'charts'

const model = defineModel<DashboardView>({ required: true })

const { t } = useI18n()

const options = computed(() => [
  { value: 'table' as const, label: t('dashboard.mode.table'), icon: 'table' },
  { value: 'charts' as const, label: t('dashboard.mode.graphs'), icon: 'chart-bar' },
])
</script>

<template>
  <SegmentedControl v-model="model" :options="options" :label="t('dashboard.mode.label')" />
</template>
