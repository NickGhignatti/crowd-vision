<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isOpen: boolean
  isSubmitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  // Using the new payload format to support SSO config
  (e: 'add', payload: any): void
}>()

const { t } = useI18n()

const step = ref(1)
const mainDomain = ref('')
const error = ref<string | null>(null)

const authStrategy = ref<'internal' | 'oidc'>('internal')
const issuerUrl = ref('')
const clientId = ref('')
const clientSecret = ref('')

const subDomainInput = ref('')
const subDomainsList = ref<string[]>([])

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/

const isValidMain = computed(() => {
  const isNameValid = mainDomain.value.length > 0 && domainRegex.test(mainDomain.value)

  if (!isNameValid) return false

  // If OIDC is selected, require config fields
  if (authStrategy.value === 'oidc') {
    return (
      issuerUrl.value.trim() !== '' &&
      clientId.value.trim() !== '' &&
      clientSecret.value.trim() !== ''
    )
  }

  return true
})

const nextStep = () => {
  if (!isValidMain.value) {
    error.value = t('domains.modal.errorInvalidMain') || 'Please check domain name and auth config.'
    return
  }
  error.value = null
  step.value = 2
  nextTick(() => {
    document.getElementById('subdomain-input')?.focus()
  })
}

const addSubdomain = () => {
  const val = subDomainInput.value.trim().toLowerCase()

  if (!val) return

  if (!domainRegex.test(val)) {
    error.value = t('domains.modal.errorInvalidSub') || 'Invalid subdomain format.'
    return
  }

  if (subDomainsList.value.includes(val) || val === mainDomain.value.trim().toLowerCase()) {
    error.value = t('domains.modal.errorDuplicate') || 'Domain already in list.'
    return
  }

  subDomainsList.value.push(val)
  subDomainInput.value = ''
  error.value = null
}

const removeSubdomain = (index: number) => {
  subDomainsList.value.splice(index, 1)
}

const handleClose = () => {
  step.value = 1
  mainDomain.value = ''
  authStrategy.value = 'internal'
  issuerUrl.value = ''
  clientId.value = ''
  clientSecret.value = ''
  subDomainInput.value = ''
  subDomainsList.value = []
  error.value = null
  emit('close')
}

const handleSubmit = () => {
  const payload: any = {
    name: mainDomain.value.trim().toLowerCase(),
    subdomains: subDomainsList.value,
    authStrategy: authStrategy.value,
  }

  if (authStrategy.value === 'oidc') {
    payload.ssoConfig = {
      issuerUrl: issuerUrl.value,
      clientId: clientId.value,
      clientSecret: clientSecret.value,
    }
  }

  emit('add', payload)
  handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
        @click="handleClose"
      ></div>
    </Transition>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          class="w-full max-w-lg bg-white rounded-xl shadow-2xl pointer-events-auto border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div
            class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0"
          >
            <div>
              <h3 class="text-lg font-semibold text-slate-900">{{ t('domains.modal.new') }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">
                {{ t('domains.modal.step') }} {{ step }} {{ t('domains.modal.of') }} 2
              </p>
            </div>
            <button
              @click="handleClose"
              class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
            >
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <div class="p-6 overflow-y-auto custom-scrollbar">
            <div v-if="step === 1" class="space-y-6">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  {{ t('domains.modal.main') }}
                </label>
                <div class="relative group">
                  <i
                    class="ph-bold ph-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"
                  ></i>
                  <input
                    v-model="mainDomain"
                    @keydown.enter="nextStep"
                    type="text"
                    placeholder="e.g. unibo.it"
                    class="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                    autofocus
                  />
                </div>
                <p class="text-xs text-slate-500 mt-1">{{ t('domains.modal.desc') }}</p>
              </div>

              <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label class="block text-sm font-bold text-slate-700 mb-3"
                  >Authentication Strategy</label
                >
                <div class="flex flex-col sm:flex-row gap-4">
                  <label
                    class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
                  >
                    <input
                      type="radio"
                      v-model="authStrategy"
                      value="internal"
                      class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                    />
                    <div class="text-sm">
                      <span class="font-semibold block text-slate-800">Standard</span>
                      <span class="text-xs text-slate-500">Managed by Crowd Vision</span>
                    </div>
                  </label>
                  <label
                    class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
                  >
                    <input
                      type="radio"
                      v-model="authStrategy"
                      value="oidc"
                      class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                    />
                    <div class="text-sm">
                      <span class="font-semibold block text-slate-800">External SSO</span>
                      <span class="text-xs text-slate-500">OIDC (Keycloak, Auth0, etc)</span>
                    </div>
                  </label>
                </div>
              </div>

              <div
                v-if="authStrategy === 'oidc'"
                class="space-y-3 pl-4 border-l-2 border-emerald-500 bg-emerald-50/30 p-4 rounded-r-lg animate-[fadeIn_0.3s_ease-out]"
              >
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1"
                    >Issuer URL</label
                  >
                  <input
                    v-model="issuerUrl"
                    type="text"
                    placeholder="https://idp.example.com"
                    class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1"
                    >Client ID</label
                  >
                  <input
                    v-model="clientId"
                    type="text"
                    class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1"
                    >Client Secret</label
                  >
                  <input
                    v-model="clientSecret"
                    type="password"
                    class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div v-else class="space-y-5">
              <div
                class="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100"
              >
                <div
                  class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"
                >
                  <i class="ph-bold ph-check"></i>
                </div>
                <div>
                  <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wide">
                    {{ t('domains.modal.main') }}
                  </p>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-900">{{ mainDomain }}</span>
                    <span
                      v-if="authStrategy === 'oidc'"
                      class="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold"
                      >SSO</span
                    >
                    <span
                      v-else
                      class="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-bold"
                      >STD</span
                    >
                  </div>
                </div>
                <button
                  @click="step = 1"
                  class="ml-auto text-xs text-slate-500 hover:text-emerald-600 underline"
                >
                  {{ t('domains.modal.edit') }}
                </button>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium text-slate-700">
                  {{ t('domains.modal.addSub') }}
                </label>
                <div class="flex gap-2">
                  <input
                    id="subdomain-input"
                    v-model="subDomainInput"
                    @keydown.enter="addSubdomain"
                    type="text"
                    placeholder="e.g. api.unibo.it"
                    class="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all text-sm"
                  />
                  <button
                    @click="addSubdomain"
                    class="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 transition-colors"
                  >
                    <i class="ph-bold ph-plus text-lg"></i>
                  </button>
                </div>
                <p class="text-xs text-slate-500">
                  {{ t('domains.modal.pree') }}
                  <kbd
                    class="font-sans px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px]"
                  >
                    {{ t('domains.modal.enter') }}
                  </kbd>
                  {{ t('domains.modal.to') }}
                </p>
              </div>

              <div v-if="subDomainsList.length > 0" class="flex flex-wrap gap-2 pt-2">
                <div
                  v-for="(sub, index) in subDomainsList"
                  :key="index"
                  class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200 text-sm animate-[fadeIn_0.2s_ease-out]"
                >
                  <span>{{ sub }}</span>
                  <button
                    @click="removeSubdomain(index)"
                    class="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <i class="ph-bold ph-x"></i>
                  </button>
                </div>
              </div>
            </div>

            <p v-if="error" class="text-sm text-red-600 flex items-center gap-1 mt-4 animate-pulse">
              <i class="ph-fill ph-warning-circle"></i> {{ error }}
            </p>
          </div>

          <div
            class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0"
          >
            <button
              v-if="step === 2"
              @click="step = 1"
              class="text-sm text-slate-500 hover:text-slate-800 font-medium px-2 py-1 flex items-center gap-1"
            >
              <i class="ph-bold ph-arrow-left"></i> {{ t('domains.modal.back') }}
            </button>
            <div v-else></div>

            <div class="flex gap-3">
              <button
                @click="handleClose"
                class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none transition-colors"
              >
                {{ t('domains.modal.cancel') }}
              </button>

              <button
                v-if="step === 1"
                @click="nextStep"
                :disabled="!isValidMain"
                class="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {{ t('domains.modal.continue') }} <i class="ph-bold ph-arrow-right"></i>
              </button>

              <button
                v-else
                @click="handleSubmit"
                :disabled="isSubmitting"
                class="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                <i v-if="isSubmitting" class="ph-bold ph-spinner animate-spin"></i>
                <span v-else
                  >{{ t('domains.modal.create') }} ({{ subDomainsList.length + 1 }})</span
                >
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Custom scrollbar for a cleaner look */
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
