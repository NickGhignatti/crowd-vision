<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  issuerUrl: string
  clientId: string
  clientSecret: string
}>()

const emit = defineEmits<{
  (e: 'update:issuerUrl', value: string): void
  (e: 'update:clientId', value: string): void
  (e: 'update:clientSecret', value: string): void
}>()

type FieldKey = 'issuerUrl' | 'clientId' | 'clientSecret'

const updateField = (key: FieldKey, value: string): void => {
  switch (key) {
    case 'issuerUrl':
      emit('update:issuerUrl', value)
      break
    case 'clientId':
      emit('update:clientId', value)
      break
    case 'clientSecret':
      emit('update:clientSecret', value)
      break
  }
}

const getFieldValue = (key: FieldKey): string => props[key]

const fields = [
  {
    key: 'issuerUrl' as const,
    label: 'domains.inputs.issuerUrl',
    placeholder: 'https://idp.example.com',
    type: 'text',
  },
  {
    key: 'clientId' as const,
    label: 'domains.inputs.clientID',
    placeholder: '',
    type: 'text',
  },
  {
    key: 'clientSecret' as const,
    label: 'domains.inputs.clientSecret',
    placeholder: '',
    type: 'password',
  },
]
</script>

<template>
  <div
    class="space-y-3 pl-4 border-l-2 border-emerald-500 bg-emerald-50/30 p-4 rounded-r-lg animate-[fadeIn_0.3s_ease-out]"
  >
    <div v-for="field in fields" :key="field.key">
      <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
        {{ t(field.label) }}
      </label>
      <input
        :value="getFieldValue(field.key)"
        @input="updateField(field.key, ($event.target as HTMLInputElement).value)"
        :type="field.type"
        :placeholder="field.placeholder"
        class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
      />
    </div>
  </div>
</template>
