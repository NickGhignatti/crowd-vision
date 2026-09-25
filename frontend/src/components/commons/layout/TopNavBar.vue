<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/authentication/useAuth.ts'
import BrandLogo from '@/components/commons/layout/BrandLogo.vue'
import NavLinks from '@/components/commons/layout/NavLinks.vue'
import MobileMenu from '@/components/commons/layout/MobileMenu.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import LanguageMenu from '@/components/commons/navigation/LanguageMenu.vue'
import ThemeToggle from '@/components/commons/navigation/ThemeToggle.vue'
import NotificationMenu from '@/components/commons/navigation/NotificationMenu.vue'
import ProfileMenu from '@/components/commons/navigation/ProfileMenu.vue'
import GuestActions from '@/components/commons/navigation/GuestActions.vue'

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const route = useRoute()
const isMenuOpen = ref(false)

watch(
  () => route.fullPath,
  () => (isMenuOpen.value = false),
)
</script>

<template>
  <header
    class="sticky top-0 z-40 w-full bg-surface-container-lowest/85 shadow-soft backdrop-blur-md"
  >
    <div class="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-margin">
      <div class="flex min-w-0 items-center gap-8">
        <BrandLogo />
        <NavLinks class="hidden md:flex" />
      </div>

      <div class="flex items-center gap-1 sm:gap-2">
        <LanguageMenu />
        <ThemeToggle />
        <NotificationMenu v-if="isLoggedIn" />
        <div class="mx-1 hidden h-6 w-px bg-outline-variant md:block" />
        <ProfileMenu v-if="isLoggedIn" class="hidden md:block" />
        <GuestActions v-else class="hidden md:flex" />
        <IconButton
          class="md:hidden"
          :icon="isMenuOpen ? 'x' : 'list'"
          :label="t('commons.menu')"
          @click="isMenuOpen = !isMenuOpen"
        />
      </div>
    </div>

    <MobileMenu v-if="isMenuOpen" class="md:hidden" @navigate="isMenuOpen = false" />
  </header>
</template>
