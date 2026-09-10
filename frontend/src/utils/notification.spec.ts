import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Notification } from '@/models/notification.ts'
import { SEVERITY_DOT, toListItem } from './notification.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/notification.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  cases: { name: string; body: Notification }[]
}

describe('the notification the server sends', () => {
  it.each(wire.cases)('$name has a colour for its severity', ({ body }) => {
    expect(SEVERITY_DOT[body.type]).toMatch(/^bg-/)
  })

  it.each(wire.cases)('$name keeps the server id, type and timestamp in the bell', ({ body }) => {
    expect(toListItem(body)).toMatchObject({
      id: body.id,
      type: body.type,
      timestamp: body.timestamp,
      read: false,
    })
  })
})
