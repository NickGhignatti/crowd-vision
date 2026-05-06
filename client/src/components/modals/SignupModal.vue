<script setup lang="ts">
import BaseModal from '@/components/modals/BaseModal.vue'
import MailInput from '@/components/inputs/MailInput.vue'
import UsernameInput from '@/components/inputs/UsernameInput.vue'
import PasswordInput from '@/components/inputs/PasswordInput.vue'

import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authentication.ts'

const { t } = useI18n()
const authStore = useAuthStore()

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-login'): void
}>()

const account = reactive({ accountName: '', email: '', password: '', otp: '' })
const hasInviteCode = ref(false)
const otpError = ref('')

const toggleInviteCode = () => {
  hasInviteCode.value = !hasInviteCode.value
  if (!hasInviteCode.value) {
    account.otp = ''
    otpError.value = ''
  }
}

const formatOtp = (e: Event) => {
  const input = e.target as HTMLInputElement
  // strip non-digits, limit to 6
  account.otp = input.value.replace(/\D/g, '').slice(0, 6)
  otpError.value = ''
}

const handleSignUp = async () => {
  if (hasInviteCode.value && account.otp && account.otp.length !== 6) {
    otpError.value = 'Code must be 6 digits'
    return
  }

  const payload: Record<string, string> = {
    accountName: account.accountName,
    email: account.email,
    password: account.password,
  }

  if (hasInviteCode.value && account.otp) {
    payload.otp = account.otp
  }

  try {
    await authStore.register(account.accountName, account.email, account.password, payload.otp)
    emit('close')
  } catch (e) {
    console.error(e)
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
      <UsernameInput v-model:name="account.accountName" />
      <MailInput v-model:mail="account.email" />
      <PasswordInput v-model:password="account.password" />

      <!-- Invite code toggle -->
      <div class="pt-1">
        <button
          type="button"
          @click="toggleInviteCode"
          class="flex items-center gap-2 text-xs text-slate-400 hover:text-emerald-600 transition-colors group"
        >
          <span
            class="w-4 h-4 rounded-full border border-slate-300 group-hover:border-emerald-400 flex items-center justify-center transition-colors"
            :class="hasInviteCode ? 'bg-emerald-500 border-emerald-500' : ''"
          >
            <i
              class="ph-bold text-white transition-all"
              :class="hasInviteCode ? 'ph-minus text-[8px]' : 'ph-plus text-[8px]'"
            ></i>
          </span>
          {{ hasInviteCode ? 'Remove invite code' : 'I have an invite code' }}
        </button>

        <!-- Collapsible OTP input -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-if="hasInviteCode" class="mt-3 space-y-1">
            <div class="relative">
              <input
                :value="account.otp"
                @input="formatOtp"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="000000"
                class="w-full px-4 py-2.5 rounded-xl border font-mono text-xl tracking-[0.5em] text-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-0"
                :class="
                  otpError
                    ? 'border-red-300 focus:ring-red-400 bg-red-50'
                    : 'border-slate-300 focus:ring-emerald-500 focus:border-transparent bg-white'
                "
              />
              <!-- digit progress dots -->
              <div class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                <span
                  v-for="i in 6"
                  :key="i"
                  class="w-1 h-1 rounded-full transition-colors duration-100"
                  :class="i <= account.otp.length ? 'bg-emerald-500' : 'bg-slate-200'"
                />
              </div>
            </div>
            <p v-if="otpError" class="text-xs text-red-500 text-center">{{ otpError }}</p>
            <p v-else class="text-xs text-slate-400 text-center">
              6-digit code from your organisation admin
            </p>
          </div>
        </Transition>
      </div>

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
