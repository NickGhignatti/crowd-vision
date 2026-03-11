<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LangOption from '@/components/buttons/LanguageOption.vue'

const { locale } = useI18n()

const isLangDropdownOpen = ref(false)

const languages = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
]

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
      title="Change Language"
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
