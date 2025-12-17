<script setup lang="ts">
import { ref } from 'vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import SignUpModal from '@/components/auth/SignupModal.vue'

const activeModal = ref<'login' | 'signup' | null>(null)
const isMobileMenuOpen = ref(false)

const openLogin = () => (activeModal.value = 'login')
const openSignUp = () => (activeModal.value = 'signup')
const closeAll = () => (activeModal.value = null)
const toggleMobileMenu = () => (isMobileMenuOpen.value = !isMobileMenuOpen.value)
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
          <router-link
            to="/dashboard"
            class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors duration-200"
            active-class="text-emerald-600"
          >
            Dashboard
          </router-link>
          <router-link
            to="/model"
            class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors duration-200"
            active-class="text-emerald-600"
          >
            Digital Twin
          </router-link>
        </div>

        <div class="hidden md:flex items-center gap-4">
          <button
            @click="openLogin"
            class="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Log in
          </button>
          <button
            @click="openSignUp"
            class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            Get Started
          </button>
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
        <router-link
          to="/dashboard"
          class="block text-base font-semibold text-slate-600 hover:text-emerald-600"
          @click="isMobileMenuOpen = false"
        >
          Dashboard
        </router-link>
        <router-link
          to="/model"
          class="block text-base font-semibold text-slate-600 hover:text-emerald-600"
          @click="isMobileMenuOpen = false"
        >
          Digital Twin
        </router-link>

        <div class="h-px bg-slate-100 my-2"></div>

        <div class="flex flex-col gap-3">
          <button
            @click="
              () => {
                openLogin()
                isMobileMenuOpen = false
              }
            "
            class="w-full text-center py-2 text-slate-600 font-semibold border border-slate-200 rounded-xl hover:bg-slate-50"
          >
            Log in
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
            Get Started
          </button>
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
