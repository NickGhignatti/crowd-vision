import type { Citation, ChatSource } from '@/interfaces/chat.ts'

const CITATION_RE = /\s*\[\^[0-9a-fA-F-]{8,}\]/g

export function stripCitations(text: string): string {
  return text.replace(CITATION_RE, '')
}

export function uniqueSources(citations: Citation[] | undefined): ChatSource[] {
  if (!citations?.length) return []

  const seen = new Set<string>()
  const sources: ChatSource[] = []

  for (const citation of citations) {
    const key = `${citation.source}::${citation.section_path ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push({ source: citation.source, section: citation.section_path })
  }

  return sources
}
