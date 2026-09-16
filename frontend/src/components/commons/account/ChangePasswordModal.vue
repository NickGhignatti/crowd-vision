<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountSettings } from '@/composables/auth/useAccountSettings.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'

const props = defineProps<{ open: boolean }>()

defineEmits<{ close: [] }>()

const { t } = useI18n()
const { changePassword } = useAccountSettings()

const blank = () => ({ current: '', next: '', confirm: '' })
const form = ref(blank())
const isSubmitting = ref(false)
const message = ref<{ text: string; error: boolean } | null>(null)

// A form left over from a failed attempt must not leak into the next one.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = blank()
    message.value = null
  },
)

const FIELDS = [
  { key: 'current', label: 'authentication.currentPassword', autocomplete: 'current-password' },
  { key: 'next', label: 'authentication.newPassword', autocomplete: 'new-password' },
  { key: 'confirm', label: 'authentication.confirmNewPassword', autocomplete: 'new-password' },
] as const

async function submit() {
  if (form.value.next !== form.value.confirm) {
    message.value = { text: t('authentication.passwordMismatch'), error: true }
    return
  }

  message.value = null
  isSubmitting.value = true
  const result = await changePassword(form.value.current, form.value.next)
  isSubmitting.value = false

  if (result.ok) {
    form.value = blank()
    message.value = { text: t('authentication.passwordUpdated'), error: false }
  } else {
    message.value = { text: t(`authentication.${result.error ?? 'authErrorGeneric'}`), error: true }
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="lock-key"
    :title="t('authentication.changePassword')"
    @close="$emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <FormField v-for="field in FIELDS" :key="field.key" v-slot="{ id }" :label="t(field.label)">
        <TextInput
          :id="id"
          v-model="form[field.key]"
          type="password"
          :autocomplete="field.autocomplete"
          required
        />
      </FormField>
      <FormMessage v-if="message" :tone="message.error ? 'error' : 'success'">
        {{ message.text }}
      </FormMessage>
      <BaseButton type="submit" variant="primary" block :loading="isSubmitting">
        {{ t('commons.save') }}
      </BaseButton>
    </form>
  </BaseModal>
</template>
