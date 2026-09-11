import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Notification, NotificationSubscription } from '@/models/notification.ts'
import { SEVERITY_DOT, isVisible, toListItem } from './notification.ts'
import { toPreferenceMap } from './notificationPreferences.ts'

const fixtures = join(__dirname, '../../../schemas/fixtures')
const wire = JSON.parse(readFileSync(join(fixtures, 'notification.json'), 'utf8')) as {
  cases: { name: string; body: Notification }[]
}
const stored = JSON.parse(
  readFileSync(join(fixtures, 'notification-preferences.json'), 'utf8'),
) as { response: { accountPreferences: NotificationSubscription[] } }

const preferences = toPreferenceMap(stored.response.accountPreferences)
const wireCase = (name: string) => wire.cases.find((c) => c.name === name)!.body
const breach = wireCase('temperature breach, scoped to its domain')

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

describe('which notifications the bell shows', () => {
  it('shows a breach whose metric the account switched on for its domain', () => {
    expect(isVisible(breach, preferences)).toBe(true)
  })

  it('hides a breach whose metric the account switched off', () => {
    expect(isVisible(breach, { eng: { temperature: false } })).toBe(false)
  })

  it('hides a breach the account never chose, since every switch is off by default', () => {
    expect(isVisible({ ...breach, metric: 'airQuality' }, preferences)).toBe(false)
    expect(isVisible(breach, {})).toBe(false)
  })

  it('always shows a manual alert, which carries no metric', () => {
    expect(isVisible(wireCase('warning'), {})).toBe(true)
  })

  it('always shows a breach that reached no domain, which has no switch to consult', () => {
    expect(isVisible(wireCase('unroutable breach, broadcast to every client'), {})).toBe(true)
  })
})
