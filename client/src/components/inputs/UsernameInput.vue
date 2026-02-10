<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const username = defineModel<string>('username')
</script>

<template>
  <div>
    <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">{{
      t('authentication.input.username')
    }}</label>
    <input
      type="text"
      class="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-700 placeholder:text-slate-400 font-medium shadow-sm"
      :placeholder="t('authentication.input.usernamePlaceholder')"
      v-model="username"
      required
    />
  </div>
</template>
