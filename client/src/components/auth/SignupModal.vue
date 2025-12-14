<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="$emit('close')"></div>

        <div
          class="relative w-full max-w-sm bg-slate-50 rounded-2xl shadow-2xl p-8 transform transition-all border border-slate-200 overflow-hidden"
          @click.stop
        >
          <div class="absolute inset-0 z-0 opacity-50 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"></div>

          <div class="absolute top-4 right-4 z-10">
            <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-200/50">
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <div class="relative z-10 text-center mb-6">
            <div class="w-12 h-12 bg-white border border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <i class="ph-bold ph-user-plus text-2xl"></i>
            </div>
            <h2 class="text-2xl font-bold text-slate-900 tracking-tight">Create Account</h2>
            <p class="text-sm text-slate-500 mt-2">Join CrowdVision to start monitoring</p>
          </div>

          <form @submit.prevent="handleSignUp" class="relative z-10 space-y-4">
            <UsernameInput/>
            <MailInput/>
            <PasswordInput/>

            <button
              type="submit"
              class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 mt-2"
            >
              Create Account
            </button>
          </form>

          <div class="relative z-10 mt-6 text-center">
            <p class="text-xs text-slate-500">
              Already have an account?
              <button @click="$emit('switch-to-login')" class="text-emerald-600 hover:text-emerald-500 font-bold hover:underline">
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import UsernameInput from '@/components/auth/inputs/UsernameInput.vue'
import PasswordInput from '@/components/auth/inputs/PasswordInput.vue'
import MailInput from '@/components/auth/inputs/MailInput.vue'

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'switch-to-login'): void;
}>();

const router = useRouter();

const handleSignUp = () => {
  localStorage.setItem('isAuthenticated', 'true');
  emit('close');
  router.push('/dashboard');
};
</script>
