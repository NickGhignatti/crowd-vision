<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { ChatMessage } from '@/interfaces/chat.ts'
import ChatMessageCard from '@/components/cards/ChatMessageCard.vue'

const props = defineProps<{
  messages: ChatMessage[]
}>()

const scrollEl = ref<HTMLElement | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
}

watch(() => props.messages, scrollToBottom, { deep: true })
onMounted(scrollToBottom)
</script>

<template>
  <div
    ref="scrollEl"
    class="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-slate-50/60 to-white"
  >
    <div v-if="messages.length === 0" class="text-center mt-10 px-4">
      <div
        class="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3"
      >
        <i class="ph-bold ph-chat-circle-dots text-2xl"></i>
      </div>
      <p class="text-sm text-slate-600 font-medium">How can I help today?</p>
      <p class="text-xs text-slate-400 mt-1">
        Ask about buildings, rooms, occupancy, or how the platform works.
      </p>
    </div>

    <ChatMessageCard v-for="msg in messages" :key="msg.id" :message="msg" />
  </div>
</template>
