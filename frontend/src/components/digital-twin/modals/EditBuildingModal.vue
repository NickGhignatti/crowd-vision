<script setup lang="ts">
import { DEFAULT_MAX_TEMPERATURE } from '@/utils/digital-twin/thresholds.ts'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Building } from '@/types/digital-twin/building.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'

const props = defineProps<{ open: boolean; building: Building | null; saving: boolean }>()

const emit = defineEmits<{ close: []; save: [updates: Partial<Building>] }>()

const { t } = useI18n()
const form = ref({ name: '', maxTemperature: DEFAULT_MAX_TEMPERATURE })

watch(
  () => [props.open, props.building] as const,
  ([open, building]) => {
    if (!open || !building) return
    form.value = {
      name: building.name || building.id,
      maxTemperature: building.maxTemperature ?? DEFAULT_MAX_TEMPERATURE,
    }
  },
  { immediate: true },
)
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="buildings"
    :title="t('model.editBuilding.title')"
    :subtitle="building?.id"
    @close="emit('close')"
  >
    <form id="edit-building" class="space-y-4" @submit.prevent="emit('save', { ...form })">
      <FormField v-slot="{ id }" :label="t('model.editBuilding.name')">
        <TextInput :id="id" v-model="form.name" icon="text-t" required />
      </FormField>
      <FormField v-slot="{ id }" :label="t('model.maxTemp')">
        <TextInput :id="id" v-model="form.maxTemperature" type="number" icon="thermometer-hot" />
      </FormField>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton
        type="submit"
        form="edit-building"
        variant="primary"
        icon="check"
        :loading="saving"
      >
        {{ t('commons.save') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
