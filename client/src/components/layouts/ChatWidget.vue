<script setup lang="ts">
import { ref, nextTick, computed, watch } from 'vue'
import { makeRequest } from '@/composables/useApi.ts'
import { useAuth } from '@/composables/useAuth.ts'

interface Citation {
  chunk_id: string
  document_id: string
  source: string
  section_path?: string | null
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  citations?: Citation[]
}

const CITATION_RE = /\s*\[\^[0-9a-fA-F-]{8,}\]/g
const stripCitations = (s: string) => s.replace(CITATION_RE, '')

const uniqueSources = (cits: Citation[] | undefined) => {
  if (!cits?.length) return []
  const seen = new Set<string>()
  const out: { source: string; section?: string | null }[] = []
  for (const c of cits) {
    const key = `${c.source}::${c.section_path ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: c.source, section: c.section_path })
  }
  return out
}

const { isLoggedIn } = useAuth()

const isOpen = ref(false)
const input = ref('')
const messages = ref<ChatMessage[]>([])
const sending = ref(false)
const scrollEl = ref<HTMLElement | null>(null)
let nextId = 1

const canSend = computed(() => input.value.trim().length > 0 && !sending.value)

const toggle = () => {
  isOpen.value = !isOpen.value
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

const send = async () => {
  if (!canSend.value) return
  const question = input.value.trim()
  input.value = ''

  messages.value.push({ id: nextId++, role: 'user', text: question })
  const assistantMsg: ChatMessage = { id: nextId++, role: 'assistant', text: '', pending: true }
  messages.value.push(assistantMsg)
  sending.value = true

  try {
    const res = await makeRequest('/agent/ask', 'POST', {
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify({ question, stream: true }),
    })

    if (!res.ok || !res.body) {
      assistantMsg.text =
        res.status === 401
          ? 'Please log in to chat with the agent.'
          : `Request failed (${res.status}).`
      assistantMsg.pending = false
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        const dataLine = raw
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (!dataLine) continue

        try {
          const evt = JSON.parse(dataLine)
          if (evt.type === 'token' && typeof evt.text === 'string') {
            assistantMsg.text += evt.text
            assistantMsg.pending = false
          } else if (evt.type === 'done') {
            assistantMsg.pending = false
            if (Array.isArray(evt.citations) && evt.citations.length) {
              assistantMsg.citations = evt.citations as Citation[]
            }
          } else if (evt.type === 'error') {
            assistantMsg.text = evt.message || 'Something went wrong.'
            assistantMsg.pending = false
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }
    assistantMsg.pending = false
    if (!assistantMsg.text) assistantMsg.text = "I don't have an answer for that."
  } catch (err) {
    console.error('[ChatWidget] request failed', err)
    const detail = err instanceof Error ? err.message : String(err)
    assistantMsg.text = `Network error: ${detail}. Is agent-service running?`
    assistantMsg.pending = false
  } finally {
    sending.value = false
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
              <div class="text-xs text-emerald-50/90">Ask anything about your twin</div>
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
            :key="msg.id"
            class="flex flex-col"
            :class="msg.role === 'user' ? 'items-end' : 'items-start'"
          >
            <div
              class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm"
              :class="
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-md'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
              "
            >
              <span v-if="msg.text">{{
                msg.role === 'assistant' ? stripCitations(msg.text) : msg.text
              }}</span>
              <span v-if="msg.pending" class="inline-flex gap-1 items-center align-middle">
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 120ms" />
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 240ms" />
              </span>
            </div>

            <div
              v-if="msg.role === 'assistant' && msg.citations?.length"
              class="mt-1 max-w-[80%] text-[11px] text-slate-500 px-1"
            >
              <span class="font-medium text-slate-600">Sources:</span>
              <span
                v-for="(s, idx) in uniqueSources(msg.citations)"
                :key="s.source + idx"
                class="ml-1"
              >
                <span class="text-slate-700">{{ s.source }}</span>
                <span v-if="s.section" class="text-slate-400"> · {{ s.section }}</span>
                <span v-if="idx < uniqueSources(msg.citations).length - 1">,</span>
              </span>
            </div>
          </div>
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
            :disabled="!isLoggedIn || sending"
            class="flex-1 resize-none max-h-32 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:opacity-60"
          />
          <button
            type="submit"
            :disabled="!canSend || !isLoggedIn"
            class="shrink-0 w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:shadow-none"
            aria-label="Send"
          >
            <i v-if="!sending" class="ph-bold ph-paper-plane-tilt text-lg"></i>
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
