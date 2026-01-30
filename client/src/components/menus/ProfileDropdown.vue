<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  isUserDropdownOpen: boolean
  isMobileMenuOpen: boolean
}>()

defineEmits<{
  (e: 'handleLogout'): void
  (e: 'closeDropDown'): void
}>()

const { t } = useI18n()
const username = ref('')
username.value = localStorage.getItem('username') || 'User'
</script>

<template>
  <div v-if="!isMobileMenuOpen" class="relative">
    <button
      @click="$emit('closeDropDown')"
      class="flex items-center gap-3 pl-3 pr-1 py-1 rounded-full hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
    >
      <span class="text-sm font-bold text-slate-700">{{ username }}</span>
      <div
        class="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-200"
      >
        <i class="ph-bold ph-user"></i>
      </div>
    </button>

    <div
      v-if="isUserDropdownOpen"
      class="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <div class="px-4 py-3 border-b border-slate-50">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {{ t('nav.signedInAs') }}
        </p>
        <p class="text-sm font-bold text-slate-800 truncate">{{ username }}</p>
      </div>

      <button
        @click="$emit('handleLogout')"
        class="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2"
      >
        <i class="ph-bold ph-sign-out text-lg"></i>
        {{ t('nav.signOut') }}
      </button>
    </div>
  </div>
  <div v-else>
    <div class="flex items-center gap-3 px-2 py-1">
      <div
        class="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-200"
      >
        <i class="ph-bold ph-user text-xl"></i>
      </div>
      <div class="flex flex-col">
        <span class="text-xs font-bold text-slate-400 uppercase">{{ t('nav.signedInAs') }}</span>
        <span class="font-bold text-slate-900">{{ username }}</span>
      </div>
    </div>
    <button
      @click="$emit('handleLogout')"
      class="w-full text-center py-2.5 text-rose-600 font-bold border border-rose-100 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
    >
      <i class="ph-bold ph-sign-out"></i>
      {{ t('nav.signOut') }}
    </button>
  </div>
</template>
