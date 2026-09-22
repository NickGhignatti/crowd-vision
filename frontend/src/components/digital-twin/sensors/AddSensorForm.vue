<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { useDeviceKinds } from '@/composables/digital-twin/useDeviceKinds.ts'
import { sensorIcon } from '@/utils/digital-twin/sensors.ts'
import { draftRef } from '@/utils/digital-twin/sensorDraft.ts'
import type { Room } from '@/types/digital-twin/building.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'
import SegmentedControl from '@/components/commons/base/SegmentedControl.vue'

/** Opened from a room, `roomId` fixes where the sensor goes; opened from the toolbar, the user picks. */
const props = defineProps<{ roomId?: string; rooms?: Room[] }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const { add, startPlacing } = useSensorEditor()
const { kinds, failed, labelOf } = useDeviceKinds()

const name = ref('')
const sensorType = ref<string | null>(null)
const nameInput = ref<InstanceType<typeof TextInput> | null>(null)

// Preselect the first type once the catalog arrives, so the common case is one click.
watch(
  kinds,
  (loaded) => {
    sensorType.value ??= loaded[0]?.kind ?? null
  },
  { immediate: true },
)

type Where = 'room' | 'point'
const where = ref<Where>('room')
const chosenRoom = ref<string>('')
const whereOptions = computed(() => [
  { value: 'room' as const, label: t('model.sensors.inRoom'), icon: 'door' },
  { value: 'point' as const, label: t('model.sensors.atPoint'), icon: 'crosshair' },
])
const roomOptions = computed(() => [
  { value: '', label: t('model.sensors.chooseRoomPlain') },
  ...(props.rooms ?? []).map((room) => ({ value: room.id, label: room.name })),
])

const targetRoom = computed(() => props.roomId ?? (where.value === 'room' ? chosenRoom.value : ''))
const canAdd = computed(
  () =>
    name.value.trim() !== '' &&
    sensorType.value !== null &&
    (props.roomId !== undefined || where.value === 'point' || chosenRoom.value !== ''),
)

const submit = () => {
  if (!canAdd.value || !sensorType.value) return
  const sensor = { name: name.value.trim(), sensorType: sensorType.value }
  if (props.roomId === undefined && where.value === 'point') {
    startPlacing(sensor)
  } else {
    add({ ref: draftRef(), ...sensor, roomId: targetRoom.value, position: null })
  }
  emit('done')
}

onMounted(() => nameInput.value?.focus())
</script>

<template>
  <form
    class="space-y-3 rounded-xl bg-surface-container-low p-3 outline-1 outline-dashed outline-primary/60"
    @submit.prevent="submit"
    @keydown.esc.prevent="emit('done')"
  >
    <label class="block space-y-1">
      <span class="text-label-stat font-medium text-on-surface-variant">
        {{ t('model.sensors.nameLabel') }}
      </span>
      <TextInput
        ref="nameInput"
        v-model="name"
        size="sm"
        :placeholder="t('model.sensors.namePlaceholder')"
      />
    </label>

    <fieldset class="space-y-1">
      <legend class="text-label-stat font-medium text-on-surface-variant">
        {{ t('model.sensors.typeLabel') }}
      </legend>
      <p v-if="failed" class="text-sm text-error">{{ t('model.sensors.typesFailed') }}</p>
      <div v-else class="grid grid-cols-2 gap-1.5">
        <button
          v-for="device in kinds"
          :key="device.kind"
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm ring-1 transition-colors"
          :class="
            sensorType === device.kind
              ? 'bg-primary/10 text-primary ring-primary'
              : 'bg-surface-container-lowest text-on-surface ring-outline-variant/60 hover:ring-primary/60'
          "
          :aria-pressed="sensorType === device.kind"
          @click="sensorType = device.kind"
        >
          <BaseIcon :name="sensorIcon(device.kind)" />
          <span class="truncate">{{ labelOf(device.kind) }}</span>
        </button>
      </div>
    </fieldset>

    <fieldset v-if="roomId === undefined" class="space-y-1.5">
      <legend class="text-label-stat font-medium text-on-surface-variant">
        {{ t('model.sensors.whereLabel') }}
      </legend>
      <SegmentedControl
        v-model="where"
        :options="whereOptions"
        :label="t('model.sensors.whereLabel')"
        size="sm"
      />
      <SelectInput
        v-if="where === 'room'"
        v-model="chosenRoom"
        :options="roomOptions"
        size="sm"
        :aria-label="t('model.sensors.chooseRoomPlain')"
      />
      <p v-else class="text-sm text-on-surface-variant">{{ t('model.sensors.atPointHint') }}</p>
    </fieldset>

    <div class="flex justify-end gap-2">
      <BaseButton size="sm" variant="ghost" @click="emit('done')">
        {{ t('commons.cancel') }}
      </BaseButton>
      <BaseButton size="sm" variant="primary" type="submit" icon="plus" :disabled="!canAdd">
        {{
          roomId === undefined && where === 'point'
            ? t('model.sensors.place')
            : t('model.sensors.add')
        }}
      </BaseButton>
    </div>
  </form>
</template>
