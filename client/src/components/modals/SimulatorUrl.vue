<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isOpen: boolean
  initialUrl: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', url: string): void
}>()

const { t } = useI18n()
const url = ref(props.initialUrl)

watch(
  () => props.initialUrl,
  (newUrl) => {
    if (newUrl) url.value = newUrl
  },
)

const handleSave = () => {
  emit('save', url.value)
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="$emit('close')">
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-800">Simulator Configuration</h3>

      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">Simulator URL</label>
        <input
          v-model="url"
          type="text"
          placeholder="http://localhost:8080"
          class="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
          @keyup.enter="handleSave"
        />
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <button
          @click="$emit('close')"
          class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          {{ t('commons.cancel') || 'Cancel' }}
        </button>

        <button
          @click="handleSave"
          class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-md hover:bg-emerald-700 transition-colors"
        >
          {{ t('commons.save') || 'Save' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
