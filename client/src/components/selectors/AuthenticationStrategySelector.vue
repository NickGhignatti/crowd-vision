<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const model = defineModel<'internal' | 'oidc'>({ default: 'internal' })

const options = [
  {
    value: 'internal' as const,
    label: 'domains.inputs.standard',
    description: 'domains.inputs.managedBy',
  },
  {
    value: 'oidc' as const,
    label: 'domains.inputs.external',
    description: 'domains.inputs.externalSSO',
  },
]
</script>

<template>
  <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
    <label class="block text-sm font-bold text-slate-700 mb-3">
      {{ t('domains.inputs.strategy') }}
    </label>

    <div class="flex flex-col sm:flex-row gap-4">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
      >
        <input
          type="radio"
          :checked="model === option.value"
          @change="model = option.value"
          name="authStrategy"
          class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
        />
        <span class="text-sm">
          <span class="font-semibold block text-slate-800">{{ t(option.label) }}</span>
          <span class="text-xs text-slate-500">{{ t(option.description) }}</span>
        </span>
      </label>
    </div>
  </div>
</template>
