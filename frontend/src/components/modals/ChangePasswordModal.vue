<script setup lang="ts">
import { ref, watch } from 'vue'
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useAccountSettings } from '@/composables/auth/useAccountSettings.ts'

const { t } = useI18n()
const { changePassword } = useAccountSettings()

const props = defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const isSubmitting = ref(false)
const message = ref<string | null>(null)
const messageIsError = ref(false)

// Every open starts from a clean slate — a password form left over from a
// previous (possibly failed) attempt must not leak into the next one.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
    message.value = null
  },
)

async function handleSubmit() {
  message.value = null

  if (newPassword.value !== confirmNewPassword.value) {
    messageIsError.value = true
    message.value = t('authentication.passwordMismatch')
    return
  }

  isSubmitting.value = true
  const result = await changePassword(currentPassword.value, newPassword.value)
  isSubmitting.value = false

  messageIsError.value = !result.ok
  if (result.ok) {
    message.value = t('authentication.passwordUpdated')
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
  } else {
    message.value = t(`authentication.${result.error ?? 'authErrorGeneric'}`)
  }
}

const inputClass =
  'w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
const buttonClass =
  'py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0'
</script>

<template>
  <StandardModal :is-open="isOpen" size="sm" @close="$emit('close')">
    <div class="relative z-10 mb-6 flex items-center gap-3">
      <span
        class="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-200"
      >
        <i class="ph-bold ph-lock-key text-lg"></i>
      </span>
      <h2 class="text-xl font-bold text-slate-900 tracking-tight">
        {{ t('authentication.changePassword') }}
      </h2>
    </div>

    <form class="relative z-10 space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label class="sr-only" for="change-password-current">{{
          t('authentication.currentPassword')
        }}</label>
        <input
          id="change-password-current"
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          required
          :placeholder="t('authentication.currentPassword')"
          :class="inputClass"
        />
      </div>
      <div>
        <label class="sr-only" for="change-password-new">{{ t('authentication.newPassword') }}</label>
        <input
          id="change-password-new"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          required
          :placeholder="t('authentication.newPassword')"
          :class="inputClass"
        />
      </div>
      <div>
        <label class="sr-only" for="change-password-confirm">{{
          t('authentication.confirmNewPassword')
        }}</label>
        <input
          id="change-password-confirm"
          v-model="confirmNewPassword"
          type="password"
          autocomplete="new-password"
          required
          :placeholder="t('authentication.confirmNewPassword')"
          :class="inputClass"
        />
      </div>
      <p v-if="message" class="text-sm" :class="messageIsError ? 'text-red-600' : 'text-emerald-600'">
        {{ message }}
      </p>
      <button type="submit" :disabled="isSubmitting" :class="buttonClass">
        {{ t('commons.save') }}
      </button>
    </form>
  </StandardModal>
</template>
