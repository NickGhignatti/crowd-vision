<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/auth/useAuth.ts'
import { useChatSessions } from '@/composables/chat/useChatSessions.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import ChatHeader from '@/components/commons/chat/ChatHeader.vue'
import ConversationBar from '@/components/commons/chat/ConversationBar.vue'
import ChatThread from '@/components/commons/chat/ChatThread.vue'
import ChatComposer from '@/components/commons/chat/ChatComposer.vue'

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const sessions = useChatSessions()

const isOpen = ref(false)
const pendingQuestion = ref('')
const messages = computed(() => sessions.activeConversation.value?.messages ?? [])
const canSend = computed(
  () => isLoggedIn.value && !sessions.sending.value && !!sessions.activeConversation.value,
)

const initialize = async () => {
  if (!isLoggedIn.value || sessions.conversations.value.length > 0) return
  await sessions.loadConversations()
  if (sessions.conversations.value.length === 0) await sessions.createConversation()
}

const toggle = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) await initialize()
}

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) sessions.clear()
  else if (isOpen.value) initialize()
})

const send = async (question: string) => {
  pendingQuestion.value = question
  await sessions.sendMessage(question)
  pendingQuestion.value = ''
}

const rename = async () => {
  const conversation = sessions.activeConversation.value
  if (!conversation) return
  const title = window.prompt(t('chat.renamePrompt'), conversation.title)?.trim()
  if (title) await sessions.renameConversation(title)
}

const remove = async () => {
  if (sessions.activeConversation.value && window.confirm(t('chat.deleteConfirm'))) {
    await sessions.deleteConversation()
  }
}
</script>

<template>
  <div class="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <section
        v-if="isOpen"
        class="surface-card flex h-[34rem] rounded-3xl shadow-lift max-h-[calc(100vh-7rem)] w-[calc(100vw-3rem)] origin-bottom-left flex-col overflow-hidden sm:w-96"
        :aria-label="t('chat.title')"
      >
        <ChatHeader @close="toggle" />
        <ConversationBar
          v-if="isLoggedIn"
          :conversations="sessions.conversations.value"
          :active-id="sessions.activeConversation.value?._id"
          :busy="sessions.loading.value || sessions.sending.value"
          @select="sessions.openConversation"
          @create="sessions.createConversation"
          @rename="rename"
          @delete="remove"
        />
        <ChatThread
          :messages="messages"
          :pending-question="pendingQuestion"
          :error="sessions.error.value"
        />
        <ChatComposer
          :disabled="!canSend"
          :sending="sessions.sending.value"
          :placeholder="isLoggedIn ? t('chat.placeholder') : t('chat.loginPlaceholder')"
          @send="send"
        />
      </section>
    </Transition>

    <button
      type="button"
      class="flex size-12 items-center justify-center rounded-full bg-primary text-2xl text-on-primary shadow-lift transition-all hover:scale-105 hover:bg-primary-container focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-95"
      :aria-label="isOpen ? t('chat.close') : t('chat.open')"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <BaseIcon
        :name="isOpen ? 'x' : 'chat-circle-dots'"
        class="transition-transform"
        :class="isOpen && 'rotate-90'"
      />
    </button>
  </div>
</template>
