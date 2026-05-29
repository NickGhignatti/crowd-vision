import { computed, ref } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { Citation, ChatMessage } from '@/interfaces/chat.ts'

// Extracts the concatenated `data:` payload from a single SSE event block.
function parseEventData(rawEvent: string): string {
  return rawEvent
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
}

export function useChatAgent() {
  const input = ref('')
  const messages = ref<ChatMessage[]>([])
  const sending = ref(false)
  let nextId = 1

  const canSend = computed(() => input.value.trim().length > 0 && !sending.value)

  const applyEvent = (message: ChatMessage, data: string) => {
    let evt
    try {
      evt = JSON.parse(data)
    } catch {
      return // ignore malformed event
    }

    if (evt.type === 'token' && typeof evt.text === 'string') {
      message.text += evt.text
      message.pending = false
    } else if (evt.type === 'done') {
      message.pending = false
      if (Array.isArray(evt.citations) && evt.citations.length) {
        message.citations = evt.citations as Citation[]
      }
    } else if (evt.type === 'error') {
      message.text = evt.message || 'Something went wrong.'
      message.pending = false
    }
  }

  const streamResponse = async (response: Response, message: ChatMessage) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const data = parseEventData(buffer.slice(0, sep))
        buffer = buffer.slice(sep + 2)
        if (data) applyEvent(message, data)
      }
    }
  }

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

      await streamResponse(res, assistantMsg)

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

  return {
    input,
    messages,
    sending,
    canSend,
    send,
  }
}
