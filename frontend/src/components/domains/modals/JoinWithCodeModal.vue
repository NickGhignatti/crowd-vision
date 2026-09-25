<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDomainsStore } from '@/stores/domains/domain.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: []; joined: [] }>()

const { t } = useI18n()
const domainsStore = useDomainsStore()

const code = ref('')
const error = ref<string | null>(null)
const isSubmitting = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    code.value = ''
    error.value = null
  },
)

const submit = async () => {
  if (!code.value.trim()) return
  isSubmitting.value = true
  error.value = null
  try {
    await domainsStore.redeemInviteCode(code.value)
    emit('joined')
  } catch {
    error.value = t('domains.inputs.joinCodeInvalid')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="ticket"
    :title="t('domains.inputs.joinWithCode')"
    :subtitle="t('domains.inputs.joinWithCodeHint')"
    @close="emit('close')"
  >
    <form id="join-code" @submit.prevent="submit">
      <FormField v-slot="{ id }" :label="t('domains.inputs.code')" :error="error">
        <TextInput
          :id="id"
          v-model="code"
          size="lg"
          icon="ticket"
          :invalid="!!error"
          :placeholder="t('domains.inputs.codePlaceholder')"
          autocomplete="off"
          autofocus
        />
      </FormField>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton
        type="submit"
        form="join-code"
        variant="primary"
        :disabled="!code.trim()"
        :loading="isSubmitting"
      >
        {{ t('commons.continue') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
