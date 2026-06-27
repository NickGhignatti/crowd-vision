<script setup lang="ts">
import { ref, nextTick, computed, watch } from 'vue'
import { useAuth } from '@/composables/auth/useAuth.ts'
import { renderMarkdown } from '@/composables/core/useMarkdown.ts'
import { useChatSessions } from '@/composables/chat/useChatSessions.ts'
import type { ChatCitation } from '@/interfaces/chat.ts'

const CITATION_RE = /\s*\[\^[0-9a-fA-F-]{8,}\]/g
const stripCitations = (s: string) => s.replace(CITATION_RE, '')

const renderAssistant = (s: string) => renderMarkdown(stripCitations(s))

// Show the full doc path without its file extension, e.g.
// "docs/platform/occupancy.md" -> "docs/platform/occupancy".
const sourceLabel = (source: string) => source.replace(/\.[^./\\]+$/, '')

const uniqueSources = (cits: ChatCitation[] | undefined) => {
  if (!cits?.length) return []
  const seen = new Set<string>()
  const out: { source: string; label: string; section?: string | null }[] = []
  for (const c of cits) {
    const key = `${c.source}::${c.section_path ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: c.source, label: sourceLabel(c.source), section: c.section_path })
  }
  return out
}

const { isLoggedIn } = useAuth()
const sessions = useChatSessions()

const isOpen = ref(false)
const input = ref('')
const pendingQuestion = ref('')
const scrollEl = ref<HTMLElement | null>(null)
const messages = computed(() => sessions.activeConversation.value?.messages ?? [])

const canSend = computed(
  () => input.value.trim().length > 0 && !sessions.sending.value && !!sessions.activeConversation.value,
)

const initializeChats = async () => {
  if (!isLoggedIn.value || sessions.conversations.value.length > 0) return
  await sessions.loadConversations()
  if (sessions.conversations.value.length === 0) await sessions.createConversation()
}

const toggle = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) await initializeChats()
}

const scrollToBottom = async () => {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
}

watch(messages, scrollToBottom, { deep: true })
watch(isOpen, (v) => {
  if (v) scrollToBottom()
})
watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) sessions.clear()
  else if (isOpen.value) initializeChats()
})

const send = async () => {
  if (!canSend.value) return
  const question = input.value.trim()
  input.value = ''
  pendingQuestion.value = question
  await sessions.sendMessage(question)
  pendingQuestion.value = ''
}

const renameChat = async () => {
  const conversation = sessions.activeConversation.value
  if (!conversation) return
  const title = window.prompt('Rename chat', conversation.title)?.trim()
  if (title) await sessions.renameConversation(title)
}

const deleteChat = async () => {
  if (sessions.activeConversation.value && window.confirm('Delete this chat permanently?')) {
    await sessions.deleteConversation()
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
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
        class="w-[22rem] sm:w-96 h-[32rem] origin-bottom-left rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white"
        >
          <div class="flex items-center gap-2">
            <div
              class="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"
            >
              <i class="ph-bold ph-sparkle text-lg"></i>
            </div>
            <div class="leading-tight">
              <div class="font-semibold text-sm">CrowdVision Agent</div>
              <div class="text-xs text-emerald-50/90">Saved conversations</div>
            </div>
          </div>
          <button
            @click="toggle"
            class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="Close chat"
          >
            <i class="ph-bold ph-x text-base"></i>
          </button>
        </div>

        <div v-if="isLoggedIn" class="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
          <select
            :value="sessions.activeConversation.value?._id"
            :disabled="sessions.loading.value || sessions.sending.value"
            class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
            aria-label="Conversation"
            @change="sessions.openConversation(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="conversation in sessions.conversations.value"
              :key="conversation._id"
              :value="conversation._id"
            >
              {{ conversation.title }}
            </option>
          </select>
          <button class="chat-action" aria-label="New chat" @click="sessions.createConversation">
            <i class="ph-bold ph-plus"></i>
          </button>
          <button class="chat-action" aria-label="Rename chat" @click="renameChat">
            <i class="ph-bold ph-pencil-simple"></i>
          </button>
          <button class="chat-action text-rose-500" aria-label="Delete chat" @click="deleteChat">
            <i class="ph-bold ph-trash"></i>
          </button>
        </div>

        <!-- Messages -->
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

          <div
            v-for="msg in messages"
            :key="msg._id ?? `${msg.role}-${msg.createdAt}`"
            class="flex flex-col"
            :class="msg.role === 'user' ? 'items-end' : 'items-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words shadow-sm"
              :class="
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-md whitespace-pre-wrap'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
              "
            >
              <template v-if="msg.role === 'user'">{{ msg.content }}</template>
              <div
                v-else-if="msg.content"
                class="chat-markdown"
                v-html="renderAssistant(msg.content)"
              ></div>
            </div>

            <div
              v-if="msg.role === 'assistant' && msg.citations?.length"
              class="mt-1.5 max-w-[85%] px-1"
            >
              <div class="flex items-center gap-1 text-[11px] font-medium text-slate-400 mb-1">
                <i class="ph-bold ph-books text-xs"></i>
                <span>Sources</span>
              </div>
              <div class="flex flex-col gap-1">
                <span
                  v-for="(s, idx) in uniqueSources(msg.citations)"
                  :key="s.source + idx"
                  class="inline-flex items-start gap-1 self-start rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1 text-[11px] leading-snug text-emerald-700"
                >
                  <i class="ph-bold ph-file-text text-[11px] mt-0.5 shrink-0 text-emerald-500"></i>
                  <span class="break-words">
                    <span class="font-medium">{{ s.label }}</span>
                    <span v-if="s.section" class="text-emerald-500/70"> · {{ s.section }}</span>
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div v-if="pendingQuestion" class="flex flex-col items-end">
            <div class="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white shadow-sm">
              {{ pendingQuestion }}
            </div>
            <div class="mt-3 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
              <span class="inline-flex gap-1 items-center align-middle">
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 120ms" />
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 240ms" />
              </span>
            </div>
          </div>

          <p v-if="sessions.error.value" class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {{ sessions.error.value }}
          </p>
        </div>

        <!-- Input -->
        <form
          @submit.prevent="send"
          class="border-t border-slate-200 bg-white p-3 flex items-end gap-2"
        >
          <textarea
            v-model="input"
            @keydown="onKeydown"
            rows="1"
            :placeholder="
              isLoggedIn ? 'Type your question…' : 'Log in to chat with the agent…'
            "
            :disabled="!isLoggedIn || sessions.sending.value"
            class="flex-1 resize-none max-h-32 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:opacity-60"
          />
          <button
            type="submit"
            :disabled="!canSend || !isLoggedIn"
            class="shrink-0 w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:shadow-none"
            aria-label="Send"
          >
            <i v-if="!sessions.sending.value" class="ph-bold ph-paper-plane-tilt text-lg"></i>
            <i v-else class="ph-bold ph-circle-notch text-lg animate-spin"></i>
          </button>
        </form>
      </div>
    </transition>

    <!-- Floating button -->
    <button
      @click="toggle"
      class="group relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-xl flex items-center justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-emerald-500/40 hover:shadow-2xl active:scale-95"
      :aria-label="isOpen ? 'Close chat' : 'Open chat'"
    >
      <span
        class="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping group-hover:hidden"
        v-if="!isOpen"
      />
      <i
        class="ph-bold text-2xl relative z-10 transition-transform duration-300"
        :class="isOpen ? 'ph-x rotate-90' : 'ph-chat-circle-dots'"
      ></i>
    </button>
  </div>
</template>

<style scoped>
.chat-action {
  display: inline-flex;
  height: 1.8rem;
  width: 1.8rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  color: #64748b;
}

.chat-action:hover {
  background: #f1f5f9;
  color: #059669;
}

/* Styling for sanitized markdown rendered via v-html (not scoped by default,
   so target it through :deep). Tuned for the compact chat bubble. */
.chat-markdown {
  line-height: 1.5;
  word-break: break-word;
}

.chat-markdown :deep(p) {
  margin: 0;
}
.chat-markdown :deep(p + p),
.chat-markdown :deep(p + ul),
.chat-markdown :deep(p + ol),
.chat-markdown :deep(ul + p),
.chat-markdown :deep(ol + p) {
  margin-top: 0.5rem;
}

.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 0.25rem 0;
  padding-left: 1.15rem;
}
.chat-markdown :deep(ul) {
  list-style: disc;
}
.chat-markdown :deep(ol) {
  list-style: decimal;
}
.chat-markdown :deep(li) {
  margin: 0.15rem 0;
}
.chat-markdown :deep(li::marker) {
  color: #94a3b8;
}

.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  margin: 0.5rem 0 0.25rem;
}
.chat-markdown :deep(h1) {
  font-size: 1.05rem;
}
.chat-markdown :deep(h2) {
  font-size: 1rem;
}
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  font-size: 0.9rem;
}

.chat-markdown :deep(a) {
  color: #059669;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-markdown :deep(strong) {
  font-weight: 600;
}

.chat-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: #f1f5f9;
  color: #0f172a;
  padding: 0.1em 0.35em;
  border-radius: 0.3rem;
}

.chat-markdown :deep(pre) {
  margin: 0.5rem 0;
  padding: 0.6rem 0.75rem;
  background: #0f172a;
  border-radius: 0.6rem;
  overflow-x: auto;
}
.chat-markdown :deep(pre code) {
  background: transparent;
  color: #e2e8f0;
  padding: 0;
  font-size: 0.8rem;
}

.chat-markdown :deep(blockquote) {
  margin: 0.4rem 0;
  padding-left: 0.6rem;
  border-left: 3px solid #d1fae5;
  color: #475569;
}

.chat-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid #e2e8f0;
  margin: 0.6rem 0;
}

.chat-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.8rem;
}
.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.25rem 0.45rem;
  text-align: left;
}
.chat-markdown :deep(th) {
  background: #f8fafc;
  font-weight: 600;
}
</style>
