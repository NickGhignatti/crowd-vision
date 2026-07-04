<script setup lang="ts">
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'

const { t } = useI18n()
const { beginRegister } = useKeycloakAuth()

const handleGoogleSignUp = () => beginRegister(window.location.pathname, 'google')

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-login'): void
}>()

// Registration is a full-page redirect to Keycloak's own hosted
// registration form — there is no in-app signup form anymore. Joining an
// existing organization via an invite code is a separate, post-login action
// (tenancy-service's /invite-codes/{code}/redeem) rather than something
// bundled into registration; the invite-code redemption UI is a follow-up,
// not built here.
const handleSignUp = () => beginRegister(window.location.pathname)
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

    <div class="relative z-10 space-y-4">
      <button
        type="button"
        @click="handleSignUp"
        class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        {{ t('authentication.createAnAccount') }}
      </button>

      <div class="flex items-center gap-3">
        <span class="h-px flex-1 bg-slate-200"></span>
        <span class="text-xs text-slate-400 uppercase tracking-wide">{{ t('authentication.or') }}</span>
        <span class="h-px flex-1 bg-slate-200"></span>
      </div>

      <button
        type="button"
        @click="handleGoogleSignUp"
        class="w-full py-3 px-4 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        <i class="ph-bold ph-google-logo text-lg"></i>
        {{ t('authentication.continueWithGoogle') }}
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
