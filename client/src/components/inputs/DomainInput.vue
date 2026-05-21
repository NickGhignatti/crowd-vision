<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToggleSwitch from '@/components/buttons/ToggleSwitch.vue'
import AuthStrategySelector from '@/components/selectors/AuthenticationStrategySelector.vue'
import OidcFields from '@/components/inputs/authentication/OidcInput.vue'
import { computed } from 'vue'

const { t } = useI18n()

const props = defineProps<{
  mainDomain: string
  masterDomainChoices?: string[]
  selectedMasterDomain?: string
  authStrategy: 'internal' | 'oidc'
  issuerUrl: string
  clientId: string
  clientSecret: string
  isVisibleFromOutside: boolean
}>()

const emit = defineEmits<{
  (e: 'update-main-domain', value: string): void
  (e: 'update-selected-master-domain', value: string): void
  (e: 'update-auth-strategy', value: 'internal' | 'oidc'): void
  (e: 'update-issuer-url', value: string): void
  (e: 'update-client-id', value: string): void
  (e: 'update-client-secret', value: string): void
  (e: 'update-is-visible-from-outside', value: boolean): void
  (e: 'next'): void
}>()

const tr = (key: string, fallback: string) => {
  const translated = t(key)
  return translated === key ? fallback : translated
}

const visibleFromOutside = computed({
  get: () => props.isVisibleFromOutside,
  set: (val) => emit('update-is-visible-from-outside', val),
})

const authStrategyModel = computed({
  get: () => props.authStrategy,
  set: (val) => emit('update-auth-strategy', val),
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1">
        {{ t('domains.inputs.modal.main') }}
      </label>

      <div class="flex items-center gap-2">
        <div class="relative group flex-1">
          <i
            class="ph-bold ph-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"></i>
          <input :value="mainDomain" @input="emit('update-main-domain', ($event.target as HTMLInputElement).value)"
            @keydown.enter="emit('next')" type="text"
            :placeholder="tr('domains.inputs.modal.mainPlaceholder', 'e.g. unibo.it')"
            class="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
            autofocus />
        </div>

        <select v-if="masterDomainChoices?.length" :value="selectedMasterDomain" @change="
          emit('update-selected-master-domain', ($event.target as HTMLSelectElement).value)
          "
          class="block w-1/3 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer">
          <option value="">{{ tr('domains.inputs.modal.none', '-- None --') }}</option>
          <option v-for="domain in masterDomainChoices" :key="domain" :value="domain">
            .{{ domain }}
          </option>
        </select>
      </div>

      <p class="text-xs text-slate-500 mt-1">{{ t('domains.inputs.modal.desc') }}</p>
    </div>

    <AuthStrategySelector v-model="authStrategyModel" />

    <OidcFields v-if="authStrategy === 'oidc'" :issuer-url="issuerUrl" :client-id="clientId"
      :client-secret="clientSecret" @update:issuer-url="emit('update-issuer-url', $event)"
      @update:client-id="emit('update-client-id', $event)"
      @update:client-secret="emit('update-client-secret', $event)" />

    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div class="flex items-center gap-3">
        <i class="ph-bold ph-globe-hemisphere-west text-slate-500 text-lg"></i>
        <div>
          <p class="text-sm font-semibold text-slate-700">
            {{ t('domains.inputs.visibleFromOutside') }}
          </p>
          <p class="text-xs text-slate-500">{{ t('domains.inputs.visibleFromOutsideDesc') }}</p>
        </div>
      </div>
      <ToggleSwitch v-model="visibleFromOutside" />
    </div>
  </div>
</template>
