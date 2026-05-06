<script setup lang="ts">
import BaseModal from '@/components/modals/BaseModal.vue'
import UsernameInput from '@/components/inputs/UsernameInput.vue'
import PasswordInput from '@/components/inputs/PasswordInput.vue'

import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authentication.ts'

const { t } = useI18n()
const authStore = useAuthStore()

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-signup'): void
}>()

const account = reactive({ accountName: '', password: '' })

const handleLogin = async () => {
  try {
    await authStore.login(account.accountName, account.password)
    emit('close')
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="$emit('close')">
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

    <form @submit.prevent="handleLogin" class="relative z-10 space-y-5">
      <UsernameInput v-model:name="account.accountName" />
      <PasswordInput v-model:password="account.password" />
      <button
        type="submit"
        class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        {{ t('authentication.login') }}
      </button>
    </form>

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
  </BaseModal>
</template>
