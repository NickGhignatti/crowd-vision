<script setup lang="ts">
import BaseModal from '@/components/modals/BaseModal.vue'
import MailInput from '@/components/inputs/MailInput.vue'
import UsernameInput from '@/components/inputs/UsernameInput.vue'
import PasswordInput from '@/components/inputs/PasswordInput.vue'

import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { nonAuthenticatedFetch } from '@/composables/useApi.ts'

const { t } = useI18n()

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-login'): void
}>()

const account = reactive({ name: '', email: '', password: '' })

const handleSignUp = async () => {
  const response = await nonAuthenticatedFetch(`/auth/register`, 'POST', {
    body: JSON.stringify(account),
  })

  if (response.ok) {
    const message = await response.json()
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('token', message.token)
    localStorage.setItem('account-name', message.account.accountName)
    emit('close')
  } else {
    console.log(await response.json())
  }
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="$emit('close')">
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

    <form @submit.prevent="handleSignUp" class="relative z-10 space-y-4">
      <UsernameInput v-model:name="account.name" />
      <MailInput v-model:mail="account.email" />
      <PasswordInput v-model:password="account.password" />
      <button
        type="submit"
        class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 mt-2"
      >
        {{ t('authentication.createAnAccount') }}
      </button>
    </form>

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
  </BaseModal>
</template>
