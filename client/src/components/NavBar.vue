<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import LoginModal from '@/components/auth/LoginModal.vue'
import SignUpModal from '@/components/auth/SignupModal.vue'
import NavbarLink from '@/components/link/NavbarLink.vue'
import RequireLogin from '@/components/modals/RequireLogin.vue'
import LanguageSelector from '@/components/link/LanguageSelector.vue'
import ProfileDropdown from '@/components/menus/ProfileDropdown.vue'
import { useI18n } from 'vue-i18n'
import NotificationDropdown from '@/components/menus/NotificationDropdown.vue'

const { t } = useI18n()
const router = useRouter()

const activeModal = ref<'login' | 'signup' | null>(null)
const isMobileMenuOpen = ref(false)
const isUserDropdownOpen = ref(false)

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

const switchDropdown = () => {
  isUserDropdownOpen.value = !isUserDropdownOpen.value
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
          <NavbarLink v-if="isLoggedIn" to="/dashboard">
            {{ t('nav.dashboard') }}
          </NavbarLink>

          <RequireLogin v-else @click="openLogin">
            {{ t('nav.dashboard') }}
          </RequireLogin>

          <NavbarLink v-if="isLoggedIn" to="/model">
            {{ t('nav.digitalTwin') }}
          </NavbarLink>

          <RequireLogin v-else @click="openLogin">
            {{ t('nav.digitalTwin') }}
          </RequireLogin>

          <NavbarLink v-if="isLoggedIn" to="/domains">
            {{ t('nav.domains') }}
          </NavbarLink>

          <RequireLogin v-else @click="openLogin">
            {{ t('nav.domains') }}
          </RequireLogin>
        </div>

        <div class="hidden md:flex items-center gap-4">
          <LanguageSelector></LanguageSelector>
          <NotificationDropdown v-if="isLoggedIn"></NotificationDropdown>

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

          <ProfileDropdown
            v-else
            :isUserDropdownOpen="isUserDropdownOpen"
            :isMobileMenuOpen="isMobileMenuOpen"
            @close-drop-down="switchDropdown"
            @handleLogout="handleLogout"
          />
        </div>

        <div class="flex items-center md:hidden">
          <LanguageSelector></LanguageSelector>
          <NotificationDropdown v-if="isLoggedIn"></NotificationDropdown>
          <button @click="toggleMobileMenu" class="text-slate-600 hover:text-slate-900 p-2">
            <i class="ph-bold text-2xl" :class="isMobileMenuOpen ? 'ph-x' : 'ph-list'"></i>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isMobileMenuOpen" class="md:hidden border-t border-slate-100 bg-white">
      <div class="px-4 pt-4 pb-6 space-y-4 flex flex-col">
        <NavbarLink v-if="isLoggedIn" to="/dashboard" @click="isMobileMenuOpen = false">
          {{ t('nav.dashboard') }}
        </NavbarLink>
        <RequireLogin v-else @click="handleLockedClick">
          {{ t('nav.dashboard') }}
        </RequireLogin>
        <NavbarLink v-if="isLoggedIn" to="/model" @click="isMobileMenuOpen = false">
          {{ t('nav.digitalTwin') }}
        </NavbarLink>
        <RequireLogin v-else @click="handleLockedClick">
          {{ t('nav.digitalTwin') }}
        </RequireLogin>

        <NavbarLink v-if="isLoggedIn" to="/domains">
          {{ t('nav.domains') }}
        </NavbarLink>

        <RequireLogin v-else @click="openLogin">
          {{ t('nav.domains') }}
        </RequireLogin>

        <!--        <div class="h-px bg-slate-100 my-2"></div>-->

        <!--        <div class="flex gap-2">-->
        <!--          <LanguageSelector></LanguageSelector>-->
        <!--        </div>-->

        <!--        <div class="h-px bg-slate-100 my-2"></div>-->

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
          <ProfileDropdown
            v-else
            :isUserDropdownOpen="isUserDropdownOpen"
            :isMobileMenuOpen="isMobileMenuOpen"
            @close-drop-down="switchDropdown"
            @handleLogout="handleLogout"
          />
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
