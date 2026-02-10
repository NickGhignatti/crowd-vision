<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  mainDomain: string
  authStrategy: string
  subDomains: string[]
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'add-subdomain', value: string): void
  (e: 'remove-subdomain', index: number): void
  (e: 'clear-error'): void
  (e: 'set-error', msg: string): void
  (e: 'edit-main'): void
}>()

const { t } = useI18n()
const subDomainInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/

onMounted(() => {
  inputRef.value?.focus()
})

const handleAdd = () => {
  const val = subDomainInput.value.trim().toLowerCase()

  if (!val) return

  if (!domainRegex.test(val) || !val.includes(props.mainDomain.trim().toLowerCase())) {
    emit('set-error', t('domains.inputs.invalid') || '')
    return
  }

  if (props.subDomains.includes(val) || val === props.mainDomain.trim().toLowerCase()) {
    emit('set-error', t('domains.inputs.alreadyPresent') || '')
    return
  }

  emit('add-subdomain', val)
  subDomainInput.value = ''
  emit('clear-error')
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
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
        @click="emit('edit-main')"
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
          ref="inputRef"
          v-model="subDomainInput"
          @keydown.enter="handleAdd"
          type="text"
          placeholder="e.g. api.unibo.it"
          class="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all text-sm"
        />
        <button
          @click="handleAdd"
          class="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 transition-colors"
        >
          <i class="ph-bold ph-plus text-lg"></i>
        </button>
      </div>
      <p class="text-xs text-slate-500">
        {{ t('domains.modal.pree') }}
        <kbd class="font-sans px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px]">
          {{ t('domains.modal.enter') }}
        </kbd>
        {{ t('domains.modal.to') }}
      </p>
    </div>

    <div v-if="subDomains.length > 0" class="flex flex-wrap gap-2 pt-2">
      <div
        v-for="(sub, index) in subDomains"
        :key="index"
        class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200 text-sm animate-[fadeIn_0.2s_ease-out]"
      >
        <span>{{ sub }}</span>
        <button
          @click="emit('remove-subdomain', index)"
          class="text-slate-400 hover:text-red-500 transition-colors"
        >
          <i class="ph-bold ph-x"></i>
        </button>
      </div>
    </div>
  </div>
</template>
