<script setup lang="ts">
const model = defineModel<string>({ default: '' })

defineProps<{
  sending: boolean
  canSend: boolean
  isLoggedIn: boolean
}>()

const emit = defineEmits<{
  (e: 'send'): void
}>()

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('send')
  }
}
</script>

<template>
  <form
    @submit.prevent="emit('send')"
    class="border-t border-slate-200 bg-white p-3 flex items-end gap-2"
  >
    <textarea
      v-model="model"
      @keydown="onKeydown"
      rows="1"
      :placeholder="isLoggedIn ? 'Type your question…' : 'Log in to chat with the agent…'"
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
</template>
