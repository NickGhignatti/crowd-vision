export interface Citation {
  chunk_id: string
  document_id: string
  source: string
  section_path?: string | null
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  citations?: Citation[]
}

export interface ChatSource {
  source: string
  section?: string | null
}
