<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
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

const { t } = useI18n()
const tr = (key: string, fallback: string) => {
  const translated = t(key)
  return translated === key ? fallback : translated
}
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
            class="ph-bold ph-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"
          ></i>
          <input
            :value="mainDomain"
            @input="emit('update-main-domain', ($event.target as HTMLInputElement).value)"
            @keydown.enter="emit('next')"
            type="text"
            :placeholder="tr('domains.inputs.modal.mainPlaceholder', 'e.g. unibo.it')"
            class="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
            autofocus
          />
        </div>

        <select
          v-if="masterDomainChoices && masterDomainChoices.length > 0"
          :value="selectedMasterDomain"
          @change="
            emit('update-selected-master-domain', ($event.target as HTMLSelectElement).value)
          "
          class="block w-1/3 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer"
        >
          <option value="">{{ tr('domains.inputs.modal.none', '-- None --') }}</option>
          <option v-for="domain in masterDomainChoices" :key="domain" :value="domain">
            .{{ domain }}
          </option>
        </select>
      </div>

      <p class="text-xs text-slate-500 mt-1">{{ t('domains.inputs.modal.desc') }}</p>
    </div>

    <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <label class="block text-sm font-bold text-slate-700 mb-3">{{
        t('domains.inputs.strategy')
      }}</label>
      <div class="flex flex-col sm:flex-row gap-4">
        <label
          class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
        >
          <input
            type="radio"
            :checked="authStrategy === 'internal'"
            @change="emit('update-auth-strategy', 'internal')"
            name="authStrategy"
            class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
          />
          <div class="text-sm">
            <span class="font-semibold block text-slate-800">{{
              t('domains.inputs.standard')
            }}</span>
            <span class="text-xs text-slate-500">{{ t('domains.inputs.managedBy') }}</span>
          </div>
        </label>
        <label
          class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
        >
          <input
            type="radio"
            :checked="authStrategy === 'oidc'"
            @change="emit('update-auth-strategy', 'oidc')"
            name="authStrategy"
            class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
          />
          <div class="text-sm">
            <span class="font-semibold block text-slate-800">{{
              t('domains.inputs.external')
            }}</span>
            <span class="text-xs text-slate-500">{{ t('domains.inputs.externalSSO') }}</span>
          </div>
        </label>
      </div>
    </div>

    <div
      v-if="authStrategy === 'oidc'"
      class="space-y-3 pl-4 border-l-2 border-emerald-500 bg-emerald-50/30 p-4 rounded-r-lg animate-[fadeIn_0.3s_ease-out]"
    >
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{{
          t('domains.inputs.issuerUrl')
        }}</label>
        <input
          :value="issuerUrl"
          @input="emit('update-issuer-url', ($event.target as HTMLInputElement).value)"
          type="text"
          :placeholder="tr('domains.inputs.modal.issuerPlaceholder', 'https://idp.example.com')"
          class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
        />
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{{
          t('domains.inputs.clientID')
        }}</label>
        <input
          :value="clientId"
          @input="emit('update-client-id', ($event.target as HTMLInputElement).value)"
          type="text"
          class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
        />
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{{
          t('domains.inputs.clientSecret')
        }}</label>
        <input
          :value="clientSecret"
          @input="emit('update-client-secret', ($event.target as HTMLInputElement).value)"
          type="password"
          class="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:border-emerald-500 outline-none"
        />
      </div>
    </div>

    <div
      class="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
    >
      <div class="flex items-center gap-3">
        <i class="ph-bold ph-globe-hemisphere-west text-slate-500 text-lg"></i>
        <div>
          <p class="text-sm font-semibold text-slate-700">
            {{ t('domains.inputs.visibleFromOutside') }}
          </p>
          <p class="text-xs text-slate-500">{{ t('domains.inputs.visibleFromOutsideDesc') }}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="isVisibleFromOutside"
        @click="emit('update-is-visible-from-outside', !isVisibleFromOutside)"
        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        :class="isVisibleFromOutside ? 'bg-emerald-600' : 'bg-slate-300'"
      >
        <span
          class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out"
          :class="isVisibleFromOutside ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
    </div>
  </div>
</template>
