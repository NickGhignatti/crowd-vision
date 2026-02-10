<script setup lang="ts">
import StepOne from './components/StepOne.vue'
import StepTwo from './components/StepTwo.vue'
import type { SSODomainPayload } from '@/models/domain.ts'

import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isOpen: boolean
  isSubmitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'add', payload: SSODomainPayload): void
}>()

const { t } = useI18n()

const step = ref(1)
const error = ref<string | null>(null)
const subDomainsList = ref<string[]>([])

const formData = reactive({
  mainDomain: '',
  authStrategy: 'internal' as 'internal' | 'oidc',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
})

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/

const isValidMain = computed(() => {
  const isNameValid = formData.mainDomain.length > 0 && domainRegex.test(formData.mainDomain)

  if (!isNameValid) return false

  if (formData.authStrategy === 'oidc') {
    return (
      formData.issuerUrl.trim() !== '' &&
      formData.clientId.trim() !== '' &&
      formData.clientSecret.trim() !== ''
    )
  }

  return true
})

const updateMainDomain = (val: string) => (formData.mainDomain = val)
const updateAuthStrategy = (val: 'internal' | 'oidc') => (formData.authStrategy = val)
const updateIssuerUrl = (val: string) => (formData.issuerUrl = val)
const updateClientId = (val: string) => (formData.clientId = val)
const updateClientSecret = (val: string) => (formData.clientSecret = val)

const addSubdomain = (val: string) => subDomainsList.value.push(val)
const removeSubdomain = (index: number) => subDomainsList.value.splice(index, 1)
const setError = (msg: string) => (error.value = msg)
const clearError = () => (error.value = null)

const nextStep = () => {
  if (!isValidMain.value) {
    error.value = t('domains.modal.errorInvalidMain') || 'Please check domain name and auth config.'
    return
  }
  error.value = null
  step.value = 2
}

const handleClose = () => {
  step.value = 1
  formData.mainDomain = ''
  formData.authStrategy = 'internal'
  formData.issuerUrl = ''
  formData.clientId = ''
  formData.clientSecret = ''
  subDomainsList.value = []
  error.value = null
  emit('close')
}

const handleSubmit = () => {
  const payload: SSODomainPayload = {
    name: formData.mainDomain.trim().toLowerCase(),
    subdomains: subDomainsList.value,
    authStrategy: formData.authStrategy,
  }

  if (formData.authStrategy === 'oidc') {
    payload.ssoConfig = {
      issuerUrl: formData.issuerUrl,
      clientId: formData.clientId,
      clientSecret: formData.clientSecret,
    }
  }

  emit('add', payload)
  handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100"
      leave-to-class="opacity-0">
      <div v-if="isOpen" class="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" @click="handleClose"></div>
    </Transition>

    <Transition enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4">
      <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          class="w-full max-w-lg bg-white rounded-xl shadow-2xl pointer-events-auto border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
          <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <div>
              <h3 class="text-lg font-semibold text-slate-900">{{ t('domains.inputs.modal.main') }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">
                {{ t('domains.inputs.modal.step') }} {{ step }} {{ t('domains.inputs.modal.of') }}
              </p>
            </div>
            <button @click="handleClose"
              class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <div class="p-6 overflow-y-auto custom-scrollbar">
            <StepOne v-if="step === 1" :main-domain="formData.mainDomain" :auth-strategy="formData.authStrategy"
              :issuer-url="formData.issuerUrl" :client-id="formData.clientId" :client-secret="formData.clientSecret"
              @update-main-domain="updateMainDomain" @update-auth-strategy="updateAuthStrategy"
              @update-issuer-url="updateIssuerUrl" @update-client-id="updateClientId"
              @update-client-secret="updateClientSecret" @next="nextStep" />

            <StepTwo v-else :main-domain="formData.mainDomain" :auth-strategy="formData.authStrategy"
              :sub-domains="subDomainsList" :error="error" @add-subdomain="addSubdomain"
              @remove-subdomain="removeSubdomain" @set-error="setError" @clear-error="clearError"
              @edit-main="step = 1" />

            <p v-if="error" class="text-sm text-red-600 flex items-center gap-1 mt-4 animate-pulse">
              <i class="ph-fill ph-warning-circle"></i> {{ error }}
            </p>
          </div>

          <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
            <button v-if="step === 2" @click="step = 1"
              class="text-sm text-slate-500 hover:text-slate-800 font-medium px-2 py-1 flex items-center gap-1">
              <i class="ph-bold ph-arrow-left"></i> {{ t('commons.back') }}
            </button>
            <div v-else></div>

            <div class="flex gap-3">
              <button @click="handleClose"
                class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none transition-colors">
                {{ t('commons.cancel') }}
              </button>

              <button v-if="step === 1" @click="nextStep" :disabled="!isValidMain"
                class="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {{ t('commons.continue') }} <i class="ph-bold ph-arrow-right"></i>
              </button>

              <button v-else @click="handleSubmit" :disabled="props.isSubmitting"
                class="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all">
                <i v-if="isSubmitting" class="ph-bold ph-spinner animate-spin"></i>
                <span v-else>{{ t('commons.create') }} ({{ subDomainsList.length + 1 }})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #cbd5e1;
}
</style>
