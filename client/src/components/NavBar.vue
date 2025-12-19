<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LoginModal from '@/components/auth/LoginModal.vue'
import SignUpModal from '@/components/auth/SignupModal.vue'

const router = useRouter()
const { t, locale } = useI18n()

const activeModal = ref<'login' | 'signup' | null>(null)
const isMobileMenuOpen = ref(false)
const isUserDropdownOpen = ref(false)
const isLangDropdownOpen = ref(false)

const isLoggedIn = ref(false)
const username = ref('')

const checkAuth = () => {
  isLoggedIn.value = localStorage.getItem('isAuthenticated') === 'true'
  username.value = localStorage.getItem('username') || 'User'
}

const handleLogout = () => {
  localStorage.removeItem('isAuthenticated')
  localStorage.removeItem('username')
  isLoggedIn.value = false
  username.value = ''
  isUserDropdownOpen.value = false
  isMobileMenuOpen.value = false
  router.push('/')
}

const openLogin = () => (activeModal.value = 'login')
const openSignUp = () => (activeModal.value = 'signup')

const closeAll = () => {
  activeModal.value = null
  checkAuth()
}
const toggleMobileMenu = () => (isMobileMenuOpen.value = !isMobileMenuOpen.value)

const handleLockedClick = () => {
  openLogin()
  isMobileMenuOpen.value = false
}

const switchLanguage = (lang: string) => {
  locale.value = lang
  localStorage.setItem('locale', lang)
  isLangDropdownOpen.value = false
}

onMounted(() => {
  checkAuth()
})
</script>

<template>
  <nav class="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="relative flex justify-between items-center h-16">
        <div class="flex items-center gap-2 cursor-pointer" @click="$router.push('/')">
          <div
            class="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm"
          >
            <i class="ph-bold ph-buildings text-xl"></i>
          </div>
          <span class="font-bold text-slate-800 text-lg tracking-tight">
            Crowd<span class="text-emerald-600">Vision</span>
          </span>
        </div>

        <div
          class="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-8"
        >
          <template v-if="isLoggedIn">
            <router-link
              to="/dashboard"
              class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors duration-200"
              active-class="text-emerald-600"
            >
              {{ t('nav.dashboard') }}
            </router-link>
          </template>
          <template v-else>
            <button
              @click="openLogin"
              class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors duration-200"
            >
              <i class="ph-bold ph-lock-key"></i>
              {{ t('nav.dashboard') }}
            </button>
          </template>

          <template v-if="isLoggedIn">
            <router-link
              to="/model"
              class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors duration-200"
              active-class="text-emerald-600"
            >
              {{ t('nav.digitalTwin') }}
            </router-link>
          </template>
          <template v-else>
            <button
              @click="openLogin"
              class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors duration-200"
            >
              <i class="ph-bold ph-lock-key"></i>
              {{ t('nav.digitalTwin') }}
            </button>
          </template>
        </div>

        <div class="hidden md:flex items-center gap-4">
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

          <template v-if="!isLoggedIn">
            <button
              @click="openLogin"
              class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              {{ t('nav.login') }}
            </button>
            <button
              @click="openSignUp"
              class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              {{ t('nav.getStarted') }}
            </button>
          </template>

          <template v-else>
            <div class="relative">
              <button
                @click="isUserDropdownOpen = !isUserDropdownOpen"
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
                  @click="handleLogout"
                  class="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2"
                >
                  <i class="ph-bold ph-sign-out text-lg"></i>
                  {{ t('nav.signOut') }}
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="flex items-center md:hidden">
          <button @click="toggleMobileMenu" class="text-slate-600 hover:text-slate-900 p-2">
            <i class="ph-bold text-2xl" :class="isMobileMenuOpen ? 'ph-x' : 'ph-list'"></i>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isMobileMenuOpen" class="md:hidden border-t border-slate-100 bg-white">
      <div class="px-4 pt-4 pb-6 space-y-4 flex flex-col">
        <template v-if="isLoggedIn">
          <router-link
            to="/dashboard"
            class="block text-base font-semibold text-slate-600 hover:text-emerald-600"
            @click="isMobileMenuOpen = false"
          >
            {{ t('nav.dashboard') }}
          </router-link>
        </template>
        <template v-else>
          <button
            @click="handleLockedClick"
            class="flex items-center gap-2 text-base font-semibold text-slate-500 hover:text-emerald-600 w-full text-left"
          >
            <i class="ph-bold ph-lock-key"></i>
            {{ t('nav.dashboard') }}
          </button>
        </template>

        <template v-if="isLoggedIn">
          <router-link
            to="/model"
            class="block text-base font-semibold text-slate-600 hover:text-emerald-600"
            @click="isMobileMenuOpen = false"
          >
            {{ t('nav.digitalTwin') }}
          </router-link>
        </template>
        <template v-else>
          <button
            @click="handleLockedClick"
            class="flex items-center gap-2 text-base font-semibold text-slate-500 hover:text-emerald-600 w-full text-left"
          >
            <i class="ph-bold ph-lock-key"></i>
            {{ t('nav.digitalTwin') }}
          </button>
        </template>

        <div class="h-px bg-slate-100 my-2"></div>

        <div class="flex gap-2">
          <button
            @click="switchLanguage('en')"
            class="px-3 py-1 text-sm rounded-md border"
            :class="
              locale === 'en'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-600'
            "
          >
            English
          </button>
          <button
            @click="switchLanguage('it')"
            class="px-3 py-1 text-sm rounded-md border"
            :class="
              locale === 'it'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-600'
            "
          >
            Italiano
          </button>
        </div>

        <div class="h-px bg-slate-100 my-2"></div>

        <div class="flex flex-col gap-3">
          <template v-if="!isLoggedIn">
            <button
              @click="handleLockedClick"
              class="w-full text-center py-2 text-slate-600 font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              {{ t('nav.login') }}
            </button>
            <button
              @click="
                () => {
                  openSignUp()
                  isMobileMenuOpen = false
                }
              "
              class="w-full text-center py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800"
            >
              {{ t('nav.getStarted') }}
            </button>
          </template>

          <template v-else>
            <div class="flex items-center gap-3 px-2 py-1">
              <div
                class="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-200"
              >
                <i class="ph-bold ph-user text-xl"></i>
              </div>
              <div class="flex flex-col">
                <span class="text-xs font-bold text-slate-400 uppercase">{{
                  t('nav.signedInAs')
                }}</span>
                <span class="font-bold text-slate-900">{{ username }}</span>
              </div>
            </div>
            <button
              @click="handleLogout"
              class="w-full text-center py-2.5 text-rose-600 font-bold border border-rose-100 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
            >
              <i class="ph-bold ph-sign-out"></i>
              {{ t('nav.signOut') }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <LoginModal
      :is-open="activeModal === 'login'"
      @close="closeAll"
      @switch-to-signup="openSignUp"
    />

    <SignUpModal
      :is-open="activeModal === 'signup'"
      @close="closeAll"
      @switch-to-login="openLogin"
    />
  </nav>
</template>
