<script setup lang="ts">
import { ref } from 'vue'
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'

const { t } = useI18n()
const { beginRegister, registerWithPassword } = useKeycloakAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorKey = ref<string | null>(null)

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-login'): void
}>()

const handleGoogleSignUp = () => beginRegister(window.location.pathname, 'google')

// The form submits straight to our own claims-gateway (see
// useKeycloakAuth.registerWithPassword), which creates the Keycloak user and
// logs it in within that same request — the browser never talks to
// Keycloak directly for this flow, unlike the Google button below. Joining
// an existing organization via an invite code is a separate, post-login
// action (tenancy-service's /invite-codes/{code}/redeem), not bundled here.
async function handleSubmit() {
  errorKey.value = null
  isSubmitting.value = true
  const result = await registerWithPassword(email.value, password.value, name.value)
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
    <div class="relative z-10 text-center mb-6">
      <div
        class="w-12 h-12 bg-white border border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm"
      >
        <i class="ph-bold ph-user-plus text-2xl"></i>
      </div>
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
        {{ t('authentication.createAnAccount') }}
      </h2>
      <p class="text-sm text-slate-500 mt-2">{{ t('authentication.join') }}</p>
    </div>

    <form class="relative z-10 space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label class="sr-only" for="signup-name">{{ t('authentication.input.name') }}</label>
        <input
          id="signup-name"
          v-model="name"
          type="text"
          autocomplete="name"
          :placeholder="t('authentication.input.namePlaceholder')"
          class="w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label class="sr-only" for="signup-email">{{ t('authentication.input.email') }}</label>
        <input
          id="signup-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="t('authentication.input.emailPlaceholder')"
          required
          class="w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label class="sr-only" for="signup-password">{{ t('authentication.input.password') }}</label>
        <input
          id="signup-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
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
        {{ isSubmitting ? t('authentication.registering') : t('authentication.createAnAccount') }}
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
        @click="handleGoogleSignUp"
        :aria-label="t('authentication.continueWithGoogle')"
        :title="t('authentication.continueWithGoogle')"
        class="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 rounded-full border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        <i class="ph-bold ph-google-logo text-xl"></i>
      </button>
    </div>

    <div class="relative z-10 mt-6 text-center">
      <p class="text-xs text-slate-500">
        {{ t('authentication.alreadyAnAccount') }}
        <button
          @click="$emit('switch-to-login')"
          class="text-emerald-600 hover:text-emerald-500 font-bold hover:underline"
        >
          {{ t('authentication.login') }}
        </button>
      </p>
    </div>
  </StandardModal>
</template>
