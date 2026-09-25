<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessage } from '@/types/commons/chat.ts'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'
import ChatBubble from '@/components/commons/chat/ChatBubble.vue'
import TypingIndicator from '@/components/commons/chat/TypingIndicator.vue'

const props = defineProps<{
  messages: ChatMessage[]
  pendingQuestion: string
  error: string | null
}>()

const { t } = useI18n()
const scroller = ref<HTMLElement | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
}

watch(() => [props.messages, props.pendingQuestion], scrollToBottom, {
  deep: true,
  immediate: true,
})
</script>

<template>
  <div
    ref="scroller"
    class="flex-1 space-y-3 overflow-y-auto bg-surface-container-low px-4 py-4"
    aria-live="polite"
  >
    <EmptyState
      v-if="messages.length === 0 && !pendingQuestion"
      icon="chat-circle-dots"
      :title="t('chat.emptyTitle')"
      :description="t('chat.emptyHint')"
    />

    <ChatBubble
      v-for="message in messages"
      :key="message._id ?? `${message.role}-${message.createdAt}`"
      :role="message.role"
      :content="message.content"
      :citations="message.citations"
    />

    <template v-if="pendingQuestion">
      <ChatBubble role="user" :content="pendingQuestion" />
      <TypingIndicator />
    </template>

    <FormMessage v-if="error">{{ error }}</FormMessage>
  </div>
</template>
