<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectInput from '@/components/commons/forms/SelectInput.vue'
import FormField from '@/components/commons/forms/FormField.vue'

const props = defineProps<{ floors: number[] }>()

const floor = defineModel<number | null>({ required: true })

const { t } = useI18n()

const options = computed(() => [
  { value: null, label: t('model.controls.allFloors') },
  ...props.floors.map((elevation, index) => ({
    value: elevation,
    label: `${t('model.controls.floor')} ${index} · ${elevation} m`,
  })),
])
</script>

<template>
  <FormField v-slot="{ id }" :label="t('model.controls.floorSelection')">
    <SelectInput :id="id" v-model="floor" :options="options" icon="stack" size="sm" />
  </FormField>
</template>
