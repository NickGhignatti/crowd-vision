<script setup lang="ts">
import { computed } from 'vue'
import type { ChatCitation, ChatMessage } from '@/types/commons/chat.ts'
import { renderMarkdown } from '@/composables/commons/useMarkdown.ts'
import { stripCitations } from '@/utils/commons/chat.ts'
import ChatSources from '@/components/commons/chat/ChatSources.vue'

const props = defineProps<{
  role: ChatMessage['role']
  content: string
  citations?: ChatCitation[]
}>()

const isUser = computed(() => props.role === 'user')
// renderMarkdown sanitizes, so the v-html below only ever sees DOMPurify output.
const html = computed(() => (isUser.value ? '' : renderMarkdown(stripCitations(props.content))))
</script>

<template>
  <div class="flex flex-col" :class="isUser ? 'items-end' : 'items-start'">
    <div
      class="max-w-[85%] break-words rounded-2xl px-3.5 py-2 text-body-sm shadow-soft"
      :class="
        isUser
          ? 'whitespace-pre-wrap rounded-br-md bg-primary text-on-primary'
          : 'rounded-bl-md bg-surface-container-lowest text-on-surface'
      "
    >
      <template v-if="isUser">{{ content }}</template>
      <div v-else-if="content" class="chat-markdown" v-html="html" />
    </div>
    <ChatSources v-if="!isUser && citations?.length" :citations="citations" />
  </div>
</template>

<style scoped>
.chat-markdown {
  line-height: 1.5;
}
.chat-markdown :deep(p) {
  margin: 0;
}
.chat-markdown :deep(:is(p, ul, ol) + :is(p, ul, ol)) {
  margin-top: 0.5rem;
}
.chat-markdown :deep(:is(ul, ol)) {
  margin: 0.25rem 0;
  padding-left: 1.15rem;
}
.chat-markdown :deep(ul) {
  list-style: disc;
}
.chat-markdown :deep(ol) {
  list-style: decimal;
}
.chat-markdown :deep(li::marker) {
  color: var(--cv-outline);
}
.chat-markdown :deep(:is(h1, h2, h3, h4)) {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.chat-markdown :deep(a) {
  color: var(--cv-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.chat-markdown :deep(strong) {
  font-weight: 600;
}
.chat-markdown :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 0.3rem;
  background: var(--cv-surface-container);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
}
.chat-markdown :deep(pre) {
  margin: 0.5rem 0;
  padding: 0.6rem 0.75rem;
  overflow-x: auto;
  border-radius: 0.6rem;
  background: var(--cv-inverse-surface);
}
.chat-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  color: var(--cv-inverse-on-surface);
}
.chat-markdown :deep(blockquote) {
  margin: 0.4rem 0;
  padding-left: 0.6rem;
  border-left: 3px solid var(--cv-secondary-container);
  color: var(--cv-on-surface-variant);
}
.chat-markdown :deep(hr) {
  margin: 0.6rem 0;
  border: 0;
  border-top: 1px solid var(--cv-outline-variant);
}
.chat-markdown :deep(table) {
  width: 100%;
  margin: 0.5rem 0;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.chat-markdown :deep(:is(th, td)) {
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--cv-outline-variant);
  text-align: left;
}
.chat-markdown :deep(th) {
  background: var(--cv-surface-container-low);
  font-weight: 600;
}
</style>
