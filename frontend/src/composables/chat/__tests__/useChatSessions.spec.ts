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

const sseResponse = (frames: unknown[], chunkSize = Number.MAX_SAFE_INTEGER) => {
  const payload = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  const bytes = new TextEncoder().encode(payload)
  let offset = 0

  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close()
        controller.enqueue(bytes.slice(offset, offset + chunkSize))
        offset += chunkSize
      },
    }),
  } as Response
}

const activeChat = () => ({
  _id: 'chat-1',
  title: 'New chat',
  messages: [],
  createdAt: 'now',
  updatedAt: 'now',
})

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

  it('renders tokens as they arrive and keeps the saved message at the end', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      sseResponse([
        { type: 'token', text: 'Room ' },
        { type: 'token', text: 'B2 is full.' },
        {
          type: 'done',
          message: {
            _id: 'msg-2',
            role: 'assistant',
            content: 'Room B2 is full.',
            citations: [{ chunk_id: 'c1', document_id: 'd1', source: 'handbook.md' }],
            createdAt: 'now',
          },
        },
      ]),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(makeRequest).toHaveBeenCalledWith('/chat/conversations/chat-1/messages', 'POST', {
      body: JSON.stringify({ content: 'Question' }),
    })
    const messages = sessions.activeConversation.value.messages
    expect(messages.map(({ content }) => content)).toEqual(['Question', 'Room B2 is full.'])
    expect(messages[1]?._id).toBe('msg-2')
    expect(messages[1]?.citations?.[0]?.chunk_id).toBe('c1')
    expect(sessions.activeConversation.value.title).toBe('Question')
  })

  it('replaces the streamed text with the saved answer when the two differ', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      sseResponse([
        { type: 'token', text: 'Let me check. ' },
        { type: 'token', text: 'Room B2 [^deadbeef] is full.' },
        {
          type: 'done',
          message: {
            _id: 'msg-2',
            role: 'assistant',
            content: 'Room B2 is full.',
            createdAt: 'now',
          },
        },
      ]),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(sessions.activeConversation.value.messages[1]?.content).toBe('Room B2 is full.')
  })

  it('reassembles a frame split across two network reads', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      sseResponse(
        [
          { type: 'token', text: 'split' },
          { type: 'done', message: { role: 'assistant', content: 'split', createdAt: 'now' } },
        ],
        7,
      ),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(sessions.activeConversation.value.messages[1]?.content).toBe('split')
  })

  it('drops the half-written exchange when the stream fails mid-answer', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      sseResponse([
        { type: 'token', text: 'half an answ' },
        { type: 'error', message: 'agent-service stream ended unexpectedly' },
      ]),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(sessions.activeConversation.value.messages).toEqual([])
    expect(sessions.error.value).toBe('agent-service stream ended unexpectedly')
  })

  it('drops the exchange when the stream ends without a terminal frame', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      sseResponse([{ type: 'token', text: 'truncated' }]),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(sessions.activeConversation.value.messages).toEqual([])
    expect(sessions.error.value).toBe('The chat response ended early')
  })

  it('reports a rejected request without starting a stream', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(
      jsonResponse({ message: 'Conversation message limit reached' }, 409),
    )
    const sessions = useChatSessions()
    sessions.activeConversation.value = activeChat()

    await sessions.sendMessage('Question')

    expect(sessions.activeConversation.value.messages).toEqual([])
    expect(sessions.error.value).toBe('Conversation message limit reached')
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
