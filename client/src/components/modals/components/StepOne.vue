<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  mainDomain: string
  authStrategy: 'internal' | 'oidc'
  issuerUrl: string
  clientId: string
  clientSecret: string
}>()

const emit = defineEmits<{
  (e: 'update-main-domain', value: string): void
  (e: 'update-auth-strategy', value: 'internal' | 'oidc'): void
  (e: 'update-issuer-url', value: string): void
  (e: 'update-client-id', value: string): void
  (e: 'update-client-secret', value: string): void
  (e: 'next'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-6">
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1">
        {{ t('domains.inputs.modal.main') }}
      </label>
      <div class="relative group">
        <i
          class="ph-bold ph-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"
        ></i>
        <input
          :value="mainDomain"
          @input="emit('update-main-domain', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('next')"
          type="text"
          placeholder="e.g. unibo.it"
          class="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
          autofocus
        />
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
          placeholder="https://idp.example.com"
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
  </div>
</template>
