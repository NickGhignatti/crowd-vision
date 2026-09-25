<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { socketState } from '@/services/socket'
import type { SelectOption } from '@/components/commons/forms/SelectInput.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import LiveIndicator from '@/components/commons/base/LiveIndicator.vue'
import LiveClock from '@/components/commons/data/LiveClock.vue'

const props = defineProps<{
  buildings: SelectOption<string>[]
  roomCount: number
  isFullscreen: boolean
}>()

defineEmits<{ 'toggle-focus': [] }>()

const buildingId = defineModel<string | undefined>('buildingId')

const { t } = useI18n()

const options = computed(() =>
  props.buildings.length ? props.buildings : [{ value: '', label: t('model.noBuildings') }],
)
</script>

<template>
  <div
    class="surface-card flex flex-col items-stretch justify-between gap-4 p-4 lg:flex-row lg:items-center lg:px-5"
  >
    <div class="flex flex-wrap items-center gap-3">
      <SelectInput
        v-model="buildingId"
        :options="options"
        :disabled="!buildings.length"
        :aria-label="t('model.selection')"
        icon="buildings"
        size="lg"
        class="sm:w-72"
      />
      <BaseBadge v-if="buildingId" tone="success" icon="door">
        {{ t('dashboard.status.rooms', { count: roomCount }, roomCount) }}
      </BaseBadge>
    </div>

    <div class="flex items-center justify-center gap-4">
      <LiveIndicator
        :active="socketState.connected"
        :label="socketState.connected ? t('dashboard.status.live') : t('dashboard.status.offline')"
      />
      <LiveClock />
    </div>

    <BaseButton
      class="self-end lg:self-auto"
      :icon="isFullscreen ? 'arrows-in' : 'arrows-out'"
      @click="$emit('toggle-focus')"
    >
      {{ isFullscreen ? t('dashboard.mode.exitFocus') : t('dashboard.mode.focusMode') }}
    </BaseButton>
  </div>
</template>
