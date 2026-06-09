import { ref } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
} from '@/interfaces/chat.ts'

const responseError = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export function useChatSessions() {
  const conversations = ref<ChatConversationSummary[]>([])
  const activeConversation = ref<ChatConversation | null>(null)
  const loading = ref(false)
  const sending = ref(false)
  const error = ref('')

  const openConversation = async (id: string) => {
    loading.value = true
    error.value = ''
    try {
      const response = await makeRequest(`/chat/conversations/${id}`)
      if (!response.ok) throw new Error(await responseError(response))
      activeConversation.value = (await response.json()) as ChatConversation
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading.value = false
    }
  }

  const loadConversations = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await makeRequest('/chat/conversations')
      if (!response.ok) throw new Error(await responseError(response))
      const body = (await response.json()) as { conversations: ChatConversationSummary[] }
      conversations.value = body.conversations

      const activeId = activeConversation.value?._id
      const nextId =
        conversations.value.find(({ _id }) => _id === activeId)?._id ?? conversations.value[0]?._id
      if (nextId) await openConversation(nextId)
      else activeConversation.value = null
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading.value = false
    }
  }

  const createConversation = async () => {
    error.value = ''
    try {
      const response = await makeRequest('/chat/conversations', 'POST', {
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error(await responseError(response))

      const conversation = (await response.json()) as ChatConversation
      conversations.value.unshift(conversation)
      activeConversation.value = conversation
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  const renameConversation = async (title: string) => {
    if (!activeConversation.value) return
    error.value = ''
    try {
      const response = await makeRequest(
        `/chat/conversations/${activeConversation.value._id}`,
        'PATCH',
        {
          body: JSON.stringify({ title }),
        },
      )
      if (!response.ok) throw new Error(await responseError(response))

      const updated = (await response.json()) as ChatConversation
      activeConversation.value = updated
      const summary = conversations.value.find(({ _id }) => _id === updated._id)
      if (summary) summary.title = updated.title
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  const deleteConversation = async () => {
    if (!activeConversation.value) return
    error.value = ''
    try {
      const id = activeConversation.value._id
      const response = await makeRequest(`/chat/conversations/${id}`, 'DELETE')
      if (!response.ok) throw new Error(await responseError(response))

      conversations.value = conversations.value.filter(({ _id }) => _id !== id)
      activeConversation.value = null
      const next = conversations.value[0]
      if (next) await openConversation(next._id)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  const sendMessage = async (content: string) => {
    if (!activeConversation.value || sending.value) return
    sending.value = true
    error.value = ''
    try {
      const conversation = activeConversation.value
      const response = await makeRequest(`/chat/conversations/${conversation._id}/messages`, 'POST', {
        body: JSON.stringify({ content }),
      })
      if (!response.ok) throw new Error(await responseError(response))

      const assistant = (await response.json()) as ChatMessage
      conversation.messages.push({
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      })
      conversation.messages.push(assistant)
      if (conversation.title === 'New chat') conversation.title = content.slice(0, 120)

      const summary = conversations.value.find(({ _id }) => _id === conversation._id)
      if (summary) {
        summary.title = conversation.title
        summary.updatedAt = new Date().toISOString()
        conversations.value = [
          summary,
          ...conversations.value.filter(({ _id }) => _id !== summary._id),
        ]
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      sending.value = false
    }
  }

  const clear = () => {
    conversations.value = []
    activeConversation.value = null
    error.value = ''
  }

  return {
    conversations,
    activeConversation,
    loading,
    sending,
    error,
    loadConversations,
    openConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    sendMessage,
    clear,
  }
}
