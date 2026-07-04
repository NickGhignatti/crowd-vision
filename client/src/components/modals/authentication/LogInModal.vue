<script setup lang="ts">
import StandardModal from '@/components/modals/StandardModal.vue'

import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'

const { t } = useI18n()
const { beginLogin } = useKeycloakAuth()

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-signup'): void
}>()

// Login is a full-page redirect to Keycloak (authorization code + PKCE) —
// there is no in-app password form anymore, see useKeycloakAuth.ts. The
// modal never actually "closes" on success in the old sense: the page
// navigates away and the app re-mounts on /auth/callback.
const handleLogin = () => beginLogin(window.location.pathname)
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

    <div class="relative z-10 space-y-5">
      <button
        type="button"
        @click="handleLogin"
        class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        {{ t('authentication.continueWithOrg') }}
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
