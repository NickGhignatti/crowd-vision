<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import AddSensorForm from '@/components/digital-twin/sensors/AddSensorForm.vue'
import SensorListItem from '@/components/digital-twin/sensors/SensorListItem.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const props = defineProps<{ roomId: string }>()

const { t } = useI18n()
const { rows: allRows, isEditing } = useSensorEditor()

const adding = ref(false)
const rows = computed(() => allRows.value.filter((row) => row.roomId === props.roomId))
</script>

<template>
  <section class="space-y-2 px-3 pb-3" :aria-label="t('model.sensors.title')">
    <h4
      class="flex items-center gap-1.5 text-label-stat font-medium uppercase text-on-surface-variant"
    >
      <BaseIcon name="broadcast" />
      {{ t('model.sensors.title') }}
    </h4>

    <p v-if="rows.length === 0" class="text-sm text-on-surface-variant">
      {{ t('model.sensors.emptyRoom') }}
    </p>

    <ul class="space-y-1.5">
      <SensorListItem v-for="row in rows" :key="row.key" :row="row" />
    </ul>

    <template v-if="isEditing">
      <AddSensorForm v-if="adding" :room-id="roomId" @done="adding = false" />
      <BaseButton v-else size="sm" variant="tonal" icon="plus" block @click="adding = true">
        {{ t('model.sensors.addToRoom') }}
      </BaseButton>
    </template>
  </section>
</template>
