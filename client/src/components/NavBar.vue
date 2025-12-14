<template>
  <nav class="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <div class="flex items-center gap-2 cursor-pointer" @click="$router.push('/')">
          <div class="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <i class="ph-bold ph-buildings text-xl"></i>
          </div>
          <span class="font-bold text-slate-800 text-lg tracking-tight">Crowd<span class="text-emerald-600">Vision</span></span>
        </div>

        <div class="flex items-center gap-4">
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

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import LoginModal from './auth/LoginModal.vue';
import SignUpModal from './auth/SignupModal.vue';

const router = useRouter();
const activeModal = ref<'login' | 'signup' | null>(null);

const openLogin = () => activeModal.value = 'login';
const openSignUp = () => activeModal.value = 'signup';
const closeAll = () => activeModal.value = null;
</script>
