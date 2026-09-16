<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RowFilter } from '@/utils/dashboard.ts'
import type { Tone } from '@/helpers/tone.ts'
import SearchInput from '@/components/commons/forms/SearchInput.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import StatusDot from '@/components/commons/base/StatusDot.vue'

defineProps<{
  canEdit: boolean
  editing: boolean
  saving: boolean
  autoPlaying: boolean
}>()

defineEmits<{
  edit: []
  'add-column': []
  save: []
  cancel: []
  'toggle-auto-play': []
}>()

const query = defineModel<string>('query', { required: true })
const filter = defineModel<RowFilter>('filter', { required: true })

const { t } = useI18n()

const FILTERS = computed<{ value: Exclude<RowFilter, 'all'>; label: string; tone: Tone }[]>(() => [
  { value: 'occupied', label: t('dashboard.filters.occupied'), tone: 'primary' },
  { value: 'alerts', label: t('dashboard.filters.alerts'), tone: 'danger' },
])

const toggleFilter = (value: RowFilter) => (filter.value = filter.value === value ? 'all' : value)
</script>

<template>
  <div class="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex flex-wrap items-center gap-3">
      <slot name="leading" />
      <SearchInput
        v-model="query"
        size="sm"
        class="sm:w-72"
        :placeholder="t('dashboard.filters.search')"
      />
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2.5">
      <button
        v-for="option in FILTERS"
        :key="option.value"
        type="button"
        :aria-pressed="filter === option.value"
        class="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-body-sm font-medium transition-colors"
        :class="
          filter === option.value
            ? 'bg-secondary-container text-on-secondary-container'
            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        "
        @click="toggleFilter(option.value)"
      >
        <StatusDot :tone="option.tone" />
        {{ option.label }}
      </button>

      <span class="mx-1 hidden h-6 w-px bg-outline-variant sm:block" />

      <template v-if="canEdit && editing">
        <BaseButton size="sm" icon="plus" :disabled="saving" @click="$emit('add-column')">
          {{ t('dashboard.table.addColumn') }}
        </BaseButton>
        <BaseButton
          size="sm"
          variant="ghost"
          icon="arrow-counter-clockwise"
          :disabled="saving"
          @click="$emit('cancel')"
        >
          {{ t('commons.cancel') }}
        </BaseButton>
        <BaseButton
          size="sm"
          variant="primary"
          icon="floppy-disk"
          :loading="saving"
          @click="$emit('save')"
        >
          {{ saving ? t('dashboard.table.saving') : t('commons.save') }}
        </BaseButton>
      </template>
      <BaseButton v-else-if="canEdit" size="sm" icon="sliders-horizontal" @click="$emit('edit')">
        {{ t('dashboard.table.editColumns') }}
      </BaseButton>

      <BaseButton
        size="sm"
        :variant="autoPlaying ? 'tonal' : 'primary'"
        :icon="autoPlaying ? 'pause' : 'play'"
        @click="$emit('toggle-auto-play')"
      >
        {{ autoPlaying ? t('dashboard.table.buttons.stop') : t('dashboard.table.buttons.start') }}
      </BaseButton>
    </div>
  </div>
</template>
