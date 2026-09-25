import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripCitations, toConversation, toConversationList, uniqueSources } from './chat.ts'

const fixture = join(__dirname, '../../../../schemas/fixtures/chat-conversation.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  list: { conversations: Record<string, unknown>[] }
  conversation: Record<string, unknown>
  rejected: { name: string; conversation: unknown }[]
}

const withoutOwner = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'userId'))

describe('the conversations chat serves', () => {
  it('reads every listed summary field for field, less the owner', () => {
    expect(toConversationList(wire.list)).toStrictEqual(wire.list.conversations.map(withoutOwner))
  })

  it('reads a full conversation, leaving citations absent wherever chat omits them', () => {
    expect(toConversation(wire.conversation)).toStrictEqual(withoutOwner(wire.conversation))
  })

  it.each(wire.rejected)('refuses $name', ({ conversation }) => {
    expect(() => toConversation(conversation)).toThrow('The chat response could not be read')
  })
})

describe('what the chat bubble shows of an answer', () => {
  it('drops the citation markers the agent leaves inline', () => {
    expect(stripCitations('Rooms are sampled [^1b2c3d4e-aaaa] every minute.')).toBe(
      'Rooms are sampled every minute.',
    )
  })

  it('keeps footnote-like text that is not a chunk id', () => {
    expect(stripCitations('see [^1]')).toBe('see [^1]')
  })
})

describe('the sources listed under an answer', () => {
  const citation = (source: string, section_path: string | null) => ({
    chunk_id: 'c',
    document_id: 'd',
    source,
    section_path,
  })

  it('lists each document section once, without its file extension', () => {
    expect(
      uniqueSources([
        citation('docs/platform/occupancy.md', 'Sampling'),
        citation('docs/platform/occupancy.md', 'Sampling'),
        citation('docs/platform/occupancy.md', null),
      ]),
    ).toEqual([
      {
        source: 'docs/platform/occupancy.md',
        label: 'docs/platform/occupancy',
        section: 'Sampling',
      },
      { source: 'docs/platform/occupancy.md', label: 'docs/platform/occupancy', section: null },
    ])
  })

  it('lists nothing for an answer without citations', () => {
    expect(uniqueSources(undefined)).toEqual([])
  })
})
