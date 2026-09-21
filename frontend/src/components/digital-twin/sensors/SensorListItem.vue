<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { useSensorTypes } from '@/composables/digital-twin/useSensorTypes.ts'
import { sensorIcon } from '@/utils/digital-twin/sensors.ts'
import type { SensorRow } from '@/utils/digital-twin/sensorDraft.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

const props = defineProps<{ row: SensorRow }>()

const { t } = useI18n()
const { isEditing, rename, remove } = useSensorEditor()
const { labelOf } = useSensorTypes()

const renaming = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const startRename = async () => {
  renaming.value = true
  newName.value = props.row.name
  await nextTick()
  nameInput.value?.select()
}

const commitRename = () => {
  const name = newName.value.trim()
  if (name && name !== props.row.name) rename(props.row.target, name)
  renaming.value = false
}
</script>

<template>
  <li
    class="space-y-1.5 rounded-lg bg-surface-container-low px-2 py-1.5"
    :class="{ 'ring-1 ring-dashed ring-primary/60': row.state !== 'saved' }"
  >
    <div class="flex items-center gap-2">
      <BaseIcon :name="sensorIcon(row.sensorType)" class="shrink-0 text-on-surface-variant" />

      <input
        v-if="renaming"
        ref="nameInput"
        v-model="newName"
        class="min-w-0 flex-1 rounded bg-surface-container-lowest px-1.5 py-0.5 text-sm ring-1 ring-outline-variant focus:outline-none focus:ring-primary"
        :aria-label="t('model.sensors.nameLabel')"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="renaming = false"
        @blur="commitRename"
      />
      <span v-else class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ row.name }}</span>
        <span class="block truncate text-[0.7rem] text-on-surface-variant">
          {{ labelOf(row.sensorType) }}
        </span>
      </span>

      <span
        v-if="row.state !== 'saved'"
        class="rounded-full bg-primary/10 px-1.5 text-[0.65rem] font-medium text-primary"
      >
        {{ row.state === 'new' ? t('model.sensors.newBadge') : t('model.sensors.editedBadge') }}
      </span>

      <template v-if="isEditing && !renaming">
        <IconButton
          icon="pencil-simple"
          size="sm"
          :label="t('model.sensors.rename')"
          @click="startRename"
        />
        <IconButton
          icon="trash"
          size="sm"
          variant="danger"
          :label="t('model.sensors.remove')"
          @click="remove(row.target)"
        />
      </template>
    </div>

    <slot v-if="isEditing" />
  </li>
</template>
