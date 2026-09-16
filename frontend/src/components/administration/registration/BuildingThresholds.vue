<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BuildingDraft, BuildingThresholdDraft } from '@/types/administration/buildingDraft.ts'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import RangeSlider from '@/components/commons/forms/RangeSlider.vue'

const props = defineProps<{ draft: BuildingDraft }>()

const emit = defineEmits<{ update: [patch: Partial<Omit<BuildingDraft, 'rooms'>>] }>()

const { t } = useI18n()

// Air quality has only an upper threshold; the lower thumb is display-only.
const aqiFloor = ref(0)

const setThreshold = (patch: Partial<BuildingThresholdDraft>) =>
  emit('update', { thresholds: { ...props.draft.thresholds, ...patch } })
</script>

<template>
  <section class="grid gap-5 md:grid-cols-2">
    <FormField v-slot="{ id }" class="md:col-span-2" :label="t('model.register.buildingName')">
      <TextInput
        :id="id"
        :model-value="draft.name"
        icon="buildings"
        :placeholder="t('model.register.buildingNamePlaceholder')"
        @update:model-value="emit('update', { name: String($event ?? '') })"
      />
    </FormField>

    <FormField :label="t('model.register.temperature')">
      <RangeSlider
        :min="0"
        :max="50"
        unit="°C"
        color="var(--cv-warning)"
        :label="t('model.register.temperature')"
        :low="draft.thresholds.minTemp"
        :high="draft.thresholds.maxTemp"
        @update:low="setThreshold({ minTemp: $event })"
        @update:high="setThreshold({ maxTemp: $event })"
      />
    </FormField>

    <FormField :label="t('model.register.indoorAqi')">
      <RangeSlider
        v-model:low="aqiFloor"
        :min="0"
        :max="200"
        color="var(--cv-tertiary)"
        :label="t('model.register.indoorAqi')"
        :high="draft.thresholds.maxAqi"
        @update:high="setThreshold({ maxAqi: $event })"
      />
    </FormField>
  </section>
</template>
