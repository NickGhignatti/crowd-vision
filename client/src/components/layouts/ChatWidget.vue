<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/auth/useAuth.ts'
import { useChatAgent } from '@/composables/chat/useChatAgent.ts'
import ChatHeader from '@/components/panels/ChatHeader.vue'
import ChatMessageList from '@/components/lists/ChatMessageList.vue'
import ChatInput from '@/components/inputs/ChatInput.vue'
import ChatToggleButton from '@/components/buttons/ChatToggleButton.vue'

const { isLoggedIn } = useAuth()
const { input, messages, sending, canSend, send } = useChatAgent()

const isOpen = ref(false)
const toggle = () => {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
    <transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div
        v-if="isOpen"
        class="w-[22rem] sm:w-96 h-[32rem] origin-bottom-right rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <ChatHeader @close="toggle" />
        <ChatMessageList :messages="messages" />
        <ChatInput
          v-model="input"
          :sending="sending"
          :can-send="canSend"
          :is-logged-in="isLoggedIn"
          @send="send"
        />
      </div>
    </transition>

    <ChatToggleButton :is-open="isOpen" @toggle="toggle" />
  </div>
</template>
