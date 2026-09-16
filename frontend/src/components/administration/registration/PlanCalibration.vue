<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'

defineProps<{ count: number; warnings: string[] }>()

defineEmits<{ change: [] }>()

const scale = defineModel<number>('scale', { required: true })

const { t } = useI18n()
</script>

<template>
  <section class="space-y-3 rounded-2xl bg-surface-container-low p-4">
    <header class="flex items-center justify-between gap-3">
      <p class="flex items-center gap-2 text-body-sm font-semibold">
        <BaseIcon name="stack" class="text-primary" />
        {{ t('model.register.plan.loaded', { count }) }}
      </p>
      <BaseButton size="sm" variant="ghost" icon="swap" @click="$emit('change')">
        {{ t('model.register.plan.change') }}
      </BaseButton>
    </header>

    <FormField
      v-slot="{ id }"
      :label="t('model.register.plan.scale')"
      :hint="t('model.register.plan.scaleHint')"
    >
      <TextInput :id="id" v-model="scale" type="number" min="0.001" step="any" icon="ruler" />
    </FormField>

    <FormMessage v-if="warnings.length" tone="warning">
      <p class="font-semibold">{{ t('model.register.plan.warnings') }}</p>
      <ul class="mt-1 list-disc pl-4">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </FormMessage>
  </section>
</template>
