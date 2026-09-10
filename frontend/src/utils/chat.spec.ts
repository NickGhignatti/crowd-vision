import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toConversation, toConversationList } from './chat.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/chat-conversation.json')
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
