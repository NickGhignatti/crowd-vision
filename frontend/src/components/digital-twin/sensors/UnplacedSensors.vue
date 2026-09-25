<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Room } from '@/types/digital-twin/building.ts'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { isUnplaced } from '@/utils/digital-twin/sensorDraft.ts'
import type { SensorRow } from '@/utils/digital-twin/sensorDraft.ts'
import SensorListItem from '@/components/digital-twin/sensors/SensorListItem.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const props = defineProps<{ rooms: Room[] }>()

const { t } = useI18n()
const { rows, move } = useSensorEditor()

const unplaced = computed(() => rows.value.filter(isUnplaced))
const roomOptions = computed(() => [
  { value: '', label: t('model.sensors.chooseRoom') },
  ...props.rooms.map((room) => ({ value: room.id, label: room.name })),
])

const moveInto = (row: SensorRow, roomId: string | undefined) => {
  if (roomId) move(row.target, { roomId, position: null })
}
</script>

<template>
  <section
    v-if="unplaced.length > 0"
    class="space-y-2 rounded-2xl bg-error-container/30 p-3 ring-1 ring-error/30"
    :aria-label="t('model.sensors.unplacedTitle')"
  >
    <h4 class="flex items-center gap-1.5 text-label-stat font-medium text-on-surface">
      <BaseIcon name="warning" class="text-error" />
      {{ t('model.sensors.unplacedTitle', unplaced.length) }}
    </h4>
    <p class="text-sm text-on-surface-variant">{{ t('model.sensors.unplacedHint') }}</p>

    <ul class="space-y-1.5">
      <SensorListItem v-for="row in unplaced" :key="row.key" :row="row">
        <SelectInput
          :model-value="''"
          :options="roomOptions"
          size="sm"
          :aria-label="t('model.sensors.chooseRoom')"
          @update:model-value="moveInto(row, $event)"
        />
      </SensorListItem>
    </ul>
  </section>
</template>
