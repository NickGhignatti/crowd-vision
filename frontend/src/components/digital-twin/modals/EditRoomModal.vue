<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Room } from '@/types/digital-twin/building.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'

const DEFAULT_MAX_TEMPERATURE = 27

const props = defineProps<{ open: boolean; room: Room | null; error: string | null }>()

const emit = defineEmits<{ close: []; save: [maxTemperature: number] }>()

const { t } = useI18n()
const maxTemperature = ref(DEFAULT_MAX_TEMPERATURE)

watch(
  () => props.room,
  (room) => {
    if (room) maxTemperature.value = room.maxTemperature ?? DEFAULT_MAX_TEMPERATURE
  },
  { immediate: true },
)
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="sliders-horizontal"
    :title="t('model.rooms.editRoom.title')"
    :subtitle="room?.name"
    @close="emit('close')"
  >
    <form id="edit-room" class="space-y-4" @submit.prevent="emit('save', maxTemperature)">
      <FormMessage tone="info">{{ t('model.rooms.editRoom.readOnlyNotice') }}</FormMessage>
      <FormField v-slot="{ id }" :label="t('model.rooms.editRoom.maxTemp')">
        <TextInput :id="id" v-model="maxTemperature" type="number" icon="thermometer-hot" />
      </FormField>
      <FormMessage v-if="error">{{ error }}</FormMessage>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton type="submit" form="edit-room" variant="primary" icon="check">
        {{ t('commons.save') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
