import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatSessions } from '@/composables/chat/useChatSessions.ts'
import { makeRequest } from '@/composables/core/useApi.ts'

vi.mock('@/composables/core/useApi.ts', () => ({
  makeRequest: vi.fn(),
}))

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

beforeEach(() => {
  vi.mocked(makeRequest).mockReset()
})

describe('useChatSessions', () => {
  it('loads the chat list and opens the newest chat', async () => {
    vi.mocked(makeRequest)
      .mockResolvedValueOnce(
        jsonResponse({
          conversations: [
            { _id: 'chat-1', title: 'First', createdAt: 'now', updatedAt: 'now' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          _id: 'chat-1',
          title: 'First',
          messages: [{ role: 'user', content: 'Saved', createdAt: 'now' }],
          createdAt: 'now',
          updatedAt: 'now',
        }),
      )

    const sessions = useChatSessions()
    await sessions.loadConversations()

    expect(sessions.activeConversation.value?.messages[0]?.content).toBe('Saved')
  })

  it('sends through the selected chat and appends the saved exchange', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      jsonResponse({
        role: 'assistant',
        content: 'Reply',
        citations: [],
        createdAt: 'now',
      }),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = {
      _id: 'chat-1',
      title: 'New chat',
      messages: [],
      createdAt: 'now',
      updatedAt: 'now',
    }

    await sessions.sendMessage('Question')

    expect(makeRequest).toHaveBeenCalledWith('/chat/conversations/chat-1/messages', 'POST', {
      body: JSON.stringify({ content: 'Question' }),
    })
    expect(sessions.activeConversation.value.messages.map(({ content }) => content)).toEqual([
      'Question',
      'Reply',
    ])
  })

  it('creates, renames, and deletes chats', async () => {
    const created = {
      _id: 'chat-1',
      title: 'New chat',
      messages: [],
      createdAt: 'now',
      updatedAt: 'now',
    }
    vi.mocked(makeRequest)
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse({ ...created, title: 'Renamed' }))
      .mockResolvedValueOnce(jsonResponse(undefined, 204))

    const sessions = useChatSessions()
    await sessions.createConversation()
    await sessions.renameConversation('Renamed')
    await sessions.deleteConversation()

    expect(sessions.conversations.value).toHaveLength(0)
    expect(sessions.activeConversation.value).toBeNull()
  })
})
