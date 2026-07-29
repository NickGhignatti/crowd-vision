<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDomainsStore } from '@/stores/domain.ts'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'joined'): void
}>()

const { t } = useI18n()
const domainsStore = useDomainsStore()

const code = ref('')
const error = ref<string | null>(null)
const isSubmitting = ref(false)

const handleClose = () => {
  code.value = ''
  error.value = null
  isSubmitting.value = false
  emit('close')
}

const handleSubmit = async () => {
  if (!code.value.trim()) return

  isSubmitting.value = true
  error.value = null
  try {
    await domainsStore.redeemInviteCode(code.value)
    emit('joined')
    handleClose()
  } catch {
    error.value = t('domains.inputs.joinCodeInvalid')
  } finally {
    isSubmitting.value = false
  }
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
          class="w-full max-w-sm bg-white rounded-xl shadow-2xl pointer-events-auto border border-slate-100 overflow-hidden flex flex-col"
        >
          <div
            class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0"
          >
            <h3 class="text-lg font-semibold text-slate-900">
              {{ t('domains.inputs.joinWithCode') }}
            </h3>
            <button
              @click="handleClose"
              class="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
            >
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <div class="relative group">
              <i
                class="ph-bold ph-ticket absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"
              ></i>
              <input
                v-model="code"
                type="text"
                :placeholder="t('domains.inputs.codePlaceholder')"
                @keydown.enter="handleSubmit"
                class="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                autofocus
              />
            </div>
            <p v-if="error" class="text-sm text-red-600 flex items-center gap-1 animate-pulse">
              <i class="ph-fill ph-warning-circle"></i> {{ error }}
            </p>
          </div>

          <div
            class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0"
          >
            <button
              @click="handleClose"
              class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none transition-colors"
            >
              {{ t('commons.cancel') }}
            </button>
            <button
              @click="handleSubmit"
              :disabled="!code.trim() || isSubmitting"
              class="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              <i v-if="isSubmitting" class="ph-bold ph-spinner animate-spin"></i>
              <span v-else>{{ t('commons.continue') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
