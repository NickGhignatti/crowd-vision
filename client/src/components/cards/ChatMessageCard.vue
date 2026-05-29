<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/interfaces/chat.ts'
import { stripCitations, uniqueSources } from '@/helpers/citations.ts'

const props = defineProps<{
  message: ChatMessage
}>()

const isUser = computed(() => props.message.role === 'user')
const displayText = computed(() =>
  isUser.value ? props.message.text : stripCitations(props.message.text),
)
const sources = computed(() => uniqueSources(props.message.citations))
</script>

<template>
  <div class="flex flex-col" :class="isUser ? 'items-end' : 'items-start'">
    <div
      class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm"
      :class="
        isUser
          ? 'bg-emerald-600 text-white rounded-br-md'
          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
      "
    >
      <span v-if="message.text">{{ displayText }}</span>
      <span v-if="message.pending" class="inline-flex gap-1 items-center align-middle">
        <span
          class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style="animation-delay: 0ms"
        />
        <span
          class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style="animation-delay: 120ms"
        />
        <span
          class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style="animation-delay: 240ms"
        />
      </span>
    </div>

    <div v-if="!isUser && sources.length" class="mt-1 max-w-[80%] text-[11px] text-slate-500 px-1">
      <span class="font-medium text-slate-600">Sources:</span>
      <span v-for="(source, idx) in sources" :key="source.source + idx" class="ml-1">
        <span class="text-slate-700">{{ source.source }}</span>
        <span v-if="source.section" class="text-slate-400"> · {{ source.section }}</span>
        <span v-if="idx < sources.length - 1">,</span>
      </span>
    </div>
  </div>
</template>
