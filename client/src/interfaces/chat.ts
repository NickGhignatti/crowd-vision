export interface ChatCitation {
  chunk_id: string
  document_id: string
  source: string
  section_path?: string | null
}

export interface ChatMessage {
  _id?: string
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
  createdAt: string
}

export interface ChatConversationSummary {
  _id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatConversation extends ChatConversationSummary {
  messages: ChatMessage[]
}
