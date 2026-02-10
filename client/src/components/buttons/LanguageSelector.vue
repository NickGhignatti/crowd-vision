<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

const isLangDropdownOpen = ref(false)

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
      <button
        @click="switchLanguage('en')"
        class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
        :class="locale === 'en' ? 'text-emerald-600 font-bold' : 'text-slate-600'"
      >
        English
      </button>
      <button
        @click="switchLanguage('it')"
        class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
        :class="locale === 'it' ? 'text-emerald-600 font-bold' : 'text-slate-600'"
      >
        Italiano
      </button>
    </div>
  </div>

  <div class="h-6 w-px bg-slate-200 mx-1"></div>
</template>
