<script setup lang="ts">
import { ref } from 'vue'
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'

const { t } = useI18n()
const { beginLogin, loginWithPassword } = useKeycloakAuth()

const username = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorKey = ref<string | null>(null)

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-signup'): void
}>()

const handleGoogleLogin = () => beginLogin(window.location.pathname, 'google')

// The form submits straight to our own claims-gateway (see
// useKeycloakAuth.loginWithPassword) — the browser never talks to Keycloak
// directly for this flow, unlike the Google button below.
async function handleSubmit() {
  errorKey.value = null
  isSubmitting.value = true
  const result = await loginWithPassword(username.value, password.value)
  isSubmitting.value = false

  if (result.ok) {
    emit('close')
  } else {
    errorKey.value = result.error ?? 'authErrorGeneric'
  }
}
</script>

<template>
  <StandardModal :is-open="isOpen" @close="$emit('close')">
    <div class="relative z-10 text-center mb-8">
      <div
        class="w-12 h-12 bg-white border border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm"
      >
        <i class="ph-bold ph-user-circle text-2xl"></i>
      </div>
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
        {{ t('authentication.welcomeBack') }}
      </h2>
      <p class="text-sm text-slate-500 mt-2">{{ t('authentication.signInToContinue') }}</p>
    </div>

    <form class="relative z-10 space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label class="sr-only" for="login-username">{{ t('authentication.input.username') }}</label>
        <input
          id="login-username"
          v-model="username"
          type="text"
          autocomplete="username"
          :placeholder="t('authentication.input.usernamePlaceholder')"
          required
          class="w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label class="sr-only" for="login-password">{{ t('authentication.input.password') }}</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('authentication.input.passwordPlaceholder')"
          required
          class="w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <p v-if="errorKey" class="text-sm text-red-600 text-center">{{ t(`authentication.${errorKey}`) }}</p>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {{ isSubmitting ? t('authentication.signingIn') : t('authentication.login') }}
      </button>
    </form>

    <div class="relative z-10 mt-5 flex items-center gap-3">
      <span class="h-px flex-1 bg-slate-200"></span>
      <span class="text-xs text-slate-400 uppercase tracking-wide">{{ t('authentication.or') }}</span>
      <span class="h-px flex-1 bg-slate-200"></span>
    </div>

    <div class="relative z-10 mt-5 flex justify-center">
      <button
        type="button"
        @click="handleGoogleLogin"
        :aria-label="t('authentication.continueWithGoogle')"
        :title="t('authentication.continueWithGoogle')"
        class="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 rounded-full border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        <i class="ph-bold ph-google-logo text-xl"></i>
      </button>
    </div>

    <div class="relative z-10 mt-6 text-center">
      <p class="text-xs text-slate-500">
        {{ t('authentication.noAccount') }}
        <button
          @click="$emit('switch-to-signup')"
          class="text-emerald-600 hover:text-emerald-500 font-bold hover:underline"
        >
          {{ t('authentication.register') }}
        </button>
      </p>
    </div>
  </StandardModal>
</template>
