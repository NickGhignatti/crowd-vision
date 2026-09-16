<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomDraft, RoomThresholdDraft } from '@/models/buildingDraft.ts'
import TextInput from '@/components/commons/forms/TextInput.vue'
import RangeSlider from '@/components/commons/forms/RangeSlider.vue'
import FormField from '@/components/commons/forms/FormField.vue'

const props = defineProps<{ room: RoomDraft }>()

const emit = defineEmits<{ update: [patch: Partial<RoomDraft>] }>()

const { t } = useI18n()

// Air quality has only an upper threshold; the lower thumb is display-only.
const aqiFloor = ref(0)

const setThreshold = (patch: Partial<RoomThresholdDraft>) =>
  emit('update', { thresholds: { ...props.room.thresholds, ...patch } })

const setCapacity = (value: unknown) => {
  const capacity = Number(value) || 0
  emit('update', { capacity, thresholds: { ...props.room.thresholds, maxPeople: capacity } })
}
</script>

<template>
  <article class="surface-card overflow-hidden">
    <div class="space-y-4 p-4">
      <header class="flex items-end gap-3">
        <FormField v-slot="{ id }" class="flex-1" :label="t('model.rooms.editRoom.name')">
          <TextInput
            :id="id"
            size="sm"
            :model-value="room.name"
            @update:model-value="emit('update', { name: String($event ?? '') })"
          />
        </FormField>
        <FormField v-slot="{ id }" class="w-28" :label="t('dashboard.table.headers.capacity')">
          <TextInput
            :id="id"
            size="sm"
            type="number"
            min="0"
            icon="users"
            :model-value="room.thresholds.maxPeople"
            @update:model-value="setCapacity"
          />
        </FormField>
      </header>
      <p class="truncate font-mono text-[10px] text-on-surface-variant">{{ room.id }}</p>

      <div class="grid gap-4 md:grid-cols-2">
        <RangeSlider
          :min="0"
          :max="50"
          unit="°C"
          color="var(--cv-warning)"
          :label="t('model.rooms.temperature')"
          :low="room.thresholds.minTemp"
          :high="room.thresholds.maxTemp"
          @update:low="setThreshold({ minTemp: $event })"
          @update:high="setThreshold({ maxTemp: $event })"
        />
        <RangeSlider
          v-model:low="aqiFloor"
          :min="0"
          :max="200"
          color="var(--cv-tertiary)"
          :label="t('model.register.room.indoorAqi')"
          :high="room.thresholds.maxAqi"
          @update:high="setThreshold({ maxAqi: $event })"
        />
      </div>
    </div>
  </article>
</template>
