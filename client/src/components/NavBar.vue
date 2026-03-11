<script setup lang="ts">
import NavLink from '@/components/buttons/NavLink.vue'
import LoginModal from '@/components/modals/LoginModal.vue'
import SignUpModal from '@/components/modals/SignupModal.vue'
import ProfileDropdown from '@/components/menus/ProfileDropdown.vue'
import LanguageSelector from '@/components/menus/LanguageSelector.vue'
import NotificationBell from '@/components/buttons/NotificationBell.vue'
import NotificationDropdown from '@/components/menus/NotificationDropdown.vue'
import { useAuth } from '@/composables/useAuth'
import { useNavLinks } from '@/composables/useNavLinks'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'

const { t } = useI18n()
const { isLoggedIn, checkAuth, handleLogout } = useAuth()
const { links } = useNavLinks()

const activeModal = ref<'login' | 'signup' | null>(null)
const isMobileMenuOpen = ref(false)
const isUserDropdownOpen = ref(false)

const openLogin = () => {
  activeModal.value = 'login'
}
const openSignUp = () => {
  activeModal.value = 'signup'
}
const closeAll = () => {
  activeModal.value = null
  checkAuth()
}
const toggleMobileMenu = () => (isMobileMenuOpen.value = !isMobileMenuOpen.value)
const handleLockedClick = () => {
  openLogin()
  isMobileMenuOpen.value = false
}
</script>

<template>
  <nav class="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="relative flex justify-between items-center h-16">
        <!-- Logo -->
        <div class="flex items-center gap-2 cursor-pointer" @click="$router.push('/')">
          <div
            class="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm"
          >
            <i class="ph-bold ph-buildings text-xl"></i>
          </div>
          <span class="font-bold text-slate-800 text-lg tracking-tight">
            {{ t('commons.app.crowd')
            }}<span class="text-emerald-600">{{ t('commons.app.vision') }}</span>
          </span>
        </div>

        <!-- Desktop links -->
        <div
          class="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-8"
        >
          <NavLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :is-logged-in="isLoggedIn"
            @locked-click="openLogin"
          >
            {{ link.label() }}
          </NavLink>
        </div>

        <!-- Desktop right -->
        <div class="hidden md:flex items-center gap-4">
          <LanguageSelector />
          <NotificationBell />
          <template v-if="!isLoggedIn">
            <button
              @click="openLogin"
              class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              {{ t('authentication.login') }}
            </button>
            <button
              @click="openSignUp"
              class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              {{ t('authentication.getStarted') }}
            </button>
          </template>
          <ProfileDropdown
            v-else
            :is-user-dropdown-open="isUserDropdownOpen"
            :is-mobile-menu-open="false"
            @close-drop-down="isUserDropdownOpen = !isUserDropdownOpen"
            @handle-logout="handleLogout"
          />
        </div>

        <!-- Mobile right -->
        <div class="flex items-center md:hidden">
          <LanguageSelector />
          <NotificationDropdown v-if="isLoggedIn" />
          <button @click="toggleMobileMenu" class="text-slate-600 hover:text-slate-900 p-2">
            <i class="ph-bold text-2xl" :class="isMobileMenuOpen ? 'ph-x' : 'ph-list'"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="isMobileMenuOpen" class="md:hidden border-t border-slate-100 bg-white">
      <div class="px-4 pt-4 pb-6 space-y-4 flex flex-col">
        <NavLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :is-logged-in="isLoggedIn"
          @click="isMobileMenuOpen = false"
          @locked-click="handleLockedClick"
        >
          {{ link.label() }}
        </NavLink>

        <div class="flex flex-col gap-3">
          <template v-if="!isLoggedIn">
            <button
              @click="handleLockedClick"
              class="w-full text-center py-2 text-slate-600 font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              {{ t('authentication.login') }}
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
              {{ t('authentication.getStarted') }}
            </button>
          </template>
          <ProfileDropdown
            v-else
            :is-user-dropdown-open="isUserDropdownOpen"
            :is-mobile-menu-open="true"
            @close-drop-down="isUserDropdownOpen = !isUserDropdownOpen"
            @handle-logout="handleLogout"
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
