<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LangOption from '@/components/buttons/LanguageOption.vue'

const i18n = useI18n() as {
  locale: Ref<string>
  t?: (key: string) => string
}

const { locale } = i18n
const tr = (key: string, fallback: string) => {
  const translated = typeof i18n.t === 'function' ? i18n.t(key) : key
  return translated === key ? fallback : translated
}

const isLangDropdownOpen = ref(false)

const languages = computed(() => [
  { code: 'en', label: tr('commons.languageSelector.english', 'English') },
  { code: 'it', label: tr('commons.languageSelector.italian', 'Italiano') },
])

const switchLanguage = (lang: string) => {
  locale.value = lang
  localStorage.setItem('locale', lang)
  isLangDropdownOpen.value = false
}
</script>

<template>
  <div class="relative">
    <button
      @click="isLangDropdownOpen = !isLangDropdownOpen"
      class="p-2 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors"
      :title="tr('commons.languageSelector.changeLanguage', 'Change Language')"
    >
      <i class="ph-bold ph-globe text-xl"></i>
    </button>

    <div
      v-if="isLangDropdownOpen"
      class="absolute right-0 top-full mt-2 w-32 bg-white rounded-xl shadow-xl border border-slate-100 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <LangOption
        v-for="lang in languages"
        :key="lang.code"
        :label="lang.label"
        :is-active="locale === lang.code"
        @select="switchLanguage(lang.code)"
      />
    </div>
  </div>

  <div class="h-6 w-px bg-slate-200 mx-1"></div>
</template>
