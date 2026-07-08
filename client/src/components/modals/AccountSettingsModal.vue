<script setup lang="ts">
import { ref, watch } from 'vue'
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useAccountSettings } from '@/composables/auth/useAccountSettings.ts'

const { t } = useI18n()
const { fetchProfile, updateProfile, changePassword } = useAccountSettings()

const props = defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

const name = ref('')
const email = ref('')
const isProfileSubmitting = ref(false)
const profileMessage = ref<string | null>(null)
const profileMessageIsError = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const isPasswordSubmitting = ref(false)
const passwordMessage = ref<string | null>(null)
const passwordMessageIsError = ref(false)

// Prefill on every open — settings data isn't part of the JWT (see
// useAccountSettings.ts), so it's fetched live each time the modal is shown
// rather than cached from a prior session.
watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return
    const result = await fetchProfile()
    if (result.ok) {
      name.value = result.name ?? ''
      email.value = result.email ?? ''
    }
  },
  { immediate: true },
)

async function handleProfileSubmit() {
  profileMessage.value = null
  isProfileSubmitting.value = true
  const result = await updateProfile(email.value, name.value)
  isProfileSubmitting.value = false

  profileMessageIsError.value = !result.ok
  profileMessage.value = result.ok
    ? t('authentication.profileUpdated')
    : t(`authentication.${result.error ?? 'authErrorGeneric'}`)
}

async function handlePasswordSubmit() {
  passwordMessage.value = null

  if (newPassword.value !== confirmNewPassword.value) {
    passwordMessageIsError.value = true
    passwordMessage.value = t('authentication.passwordMismatch')
    return
  }

  isPasswordSubmitting.value = true
  const result = await changePassword(currentPassword.value, newPassword.value)
  isPasswordSubmitting.value = false

  passwordMessageIsError.value = !result.ok
  if (result.ok) {
    passwordMessage.value = t('authentication.passwordUpdated')
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
  } else {
    passwordMessage.value = t(`authentication.${result.error ?? 'authErrorGeneric'}`)
  }
}

const inputClass =
  'w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
const buttonClass =
  'py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0'
</script>

<template>
  <StandardModal :is-open="isOpen" size="lg" @close="$emit('close')">
    <div class="relative z-10 mb-6">
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
        {{ t('authentication.settingsTitle') }}
      </h2>
    </div>

    <div class="relative z-10 space-y-8">
      <section>
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
          {{ t('authentication.profileSection') }}
        </h3>
        <form class="profile-form space-y-4" @submit.prevent="handleProfileSubmit">
          <div>
            <label class="sr-only" for="settings-name">{{ t('authentication.input.name') }}</label>
            <input
              id="settings-name"
              v-model="name"
              type="text"
              autocomplete="name"
              :placeholder="t('authentication.input.namePlaceholder')"
              :class="inputClass"
            />
          </div>
          <div>
            <label class="sr-only" for="settings-email">{{ t('authentication.input.email') }}</label>
            <input
              id="settings-email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              :placeholder="t('authentication.input.emailPlaceholder')"
              :class="inputClass"
            />
          </div>
          <p
            v-if="profileMessage"
            class="text-sm"
            :class="profileMessageIsError ? 'text-red-600' : 'text-emerald-600'"
          >
            {{ profileMessage }}
          </p>
          <button type="submit" :disabled="isProfileSubmitting" :class="buttonClass">
            {{ t('commons.save') }}
          </button>
        </form>
      </section>

      <section>
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
          {{ t('authentication.passwordSection') }}
        </h3>
        <form class="password-form space-y-4" @submit.prevent="handlePasswordSubmit">
          <div>
            <label class="sr-only" for="settings-current-password">{{
              t('authentication.currentPassword')
            }}</label>
            <input
              id="settings-current-password"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              required
              :placeholder="t('authentication.currentPassword')"
              :class="inputClass"
            />
          </div>
          <div>
            <label class="sr-only" for="settings-new-password">{{
              t('authentication.newPassword')
            }}</label>
            <input
              id="settings-new-password"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              required
              :placeholder="t('authentication.newPassword')"
              :class="inputClass"
            />
          </div>
          <div>
            <label class="sr-only" for="settings-confirm-password">{{
              t('authentication.confirmNewPassword')
            }}</label>
            <input
              id="settings-confirm-password"
              v-model="confirmNewPassword"
              type="password"
              autocomplete="new-password"
              required
              :placeholder="t('authentication.confirmNewPassword')"
              :class="inputClass"
            />
          </div>
          <p
            v-if="passwordMessage"
            class="text-sm"
            :class="passwordMessageIsError ? 'text-red-600' : 'text-emerald-600'"
          >
            {{ passwordMessage }}
          </p>
          <button type="submit" :disabled="isPasswordSubmitting" :class="buttonClass">
            {{ t('commons.save') }}
          </button>
        </form>
      </section>
    </div>
  </StandardModal>
</template>
