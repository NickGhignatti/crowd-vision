<script setup lang="ts">
import UsernameInput from '@/components/auth/inputs/UsernameInput.vue'
import PasswordInput from '@/components/auth/inputs/PasswordInput.vue'
import { reactive } from 'vue'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch-to-signup'): void
}>()

const user = reactive({
  username: '',
  password: '',
})

const serverUrl = import.meta.env.VITE_SERVER_URL
const handleLogin = async () => {
  const response = await fetch(serverUrl + `/validateUser`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: user.username,
      password: user.password,
    }),
  })

  if (response.ok) {
    localStorage.setItem('isAuthenticated', 'true')
    const message = await response.json()
    localStorage.setItem('username', message.user.username)
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans"
      >
        <div
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          @click="$emit('close')"
        ></div>

        <div
          class="relative w-full max-w-sm bg-slate-50 rounded-2xl shadow-2xl p-8 transform transition-all border border-slate-200 overflow-hidden"
          @click.stop
        >
          <div
            class="absolute inset-0 z-0 opacity-50 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"
          ></div>

          <div class="absolute top-4 right-4 z-10">
            <button
              @click="$emit('close')"
              class="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-200/50"
            >
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <div class="relative z-10 text-center mb-8">
            <div
              class="w-12 h-12 bg-white border border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm"
            >
              <i class="ph-bold ph-user-circle text-2xl"></i>
            </div>
            <h2 class="text-2xl font-bold text-slate-900 tracking-tight">Welcome Back</h2>
            <p class="text-sm text-slate-500 mt-2">Sign in to access your dashboard</p>
          </div>

          <form @submit.prevent="handleLogin" class="relative z-10 space-y-5">
            <UsernameInput v-model:username="user.username" />
            <PasswordInput v-model:password="user.password" />
            <button
              type="submit"
              class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              Sign In
            </button>
          </form>

          <div class="relative z-10 mt-6 text-center">
            <p class="text-xs text-slate-500">
              Don't have an account?
              <button
                @click="$emit('switch-to-signup')"
                class="text-emerald-600 hover:text-emerald-500 font-bold hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
