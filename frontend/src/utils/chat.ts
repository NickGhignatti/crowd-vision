import type {
  ChatCitation,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
} from '@/interfaces/chat.ts'

type Wire = Record<string, unknown>

function fail(): never {
  throw new Error('The chat response could not be read')
}

const object = (value: unknown): Wire =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Wire) : fail()

const string = (value: unknown): string => (typeof value === 'string' ? value : fail())

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : fail())

const role = (value: unknown): ChatMessage['role'] =>
  value === 'user' || value === 'assistant' ? value : fail()

const toCitation = (value: unknown): ChatCitation => {
  const wire = object(value)
  return {
    chunk_id: string(wire.chunk_id),
    document_id: string(wire.document_id),
    source: string(wire.source),
    section_path: wire.section_path === null ? null : string(wire.section_path),
  }
}

export const toChatMessage = (value: unknown): ChatMessage => {
  const wire = object(value)
  return {
    _id: string(wire._id),
    role: role(wire.role),
    content: string(wire.content),
    ...(wire.citations === undefined ? {} : { citations: array(wire.citations).map(toCitation) }),
    createdAt: string(wire.createdAt),
  }
}

export const toConversationSummary = (value: unknown): ChatConversationSummary => {
  const wire = object(value)
  return {
    _id: string(wire._id),
    title: string(wire.title),
    createdAt: string(wire.createdAt),
    updatedAt: string(wire.updatedAt),
  }
}

export const toConversationList = (body: unknown): ChatConversationSummary[] =>
  array(object(body).conversations).map(toConversationSummary)

export const toConversation = (value: unknown): ChatConversation => ({
  ...toConversationSummary(value),
  messages: array(object(value).messages).map(toChatMessage),
})
