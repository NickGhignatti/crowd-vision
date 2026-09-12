import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type NotificationSubscription, NotificationType } from '@/models/notification.ts'
import { preferenceRequest, toPreferenceMap } from './notificationPreferences.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/notification-preferences.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  response: { accountPreferences: NotificationSubscription[] }
  requests: { name: string; body: unknown }[]
  rejected: { name: string; reason: string }[]
}

describe('the preferences the server exchanges', () => {
  it('reads the reply into a domain → type → switch map', () => {
    expect(toPreferenceMap(wire.response.accountPreferences)).toEqual({
      eng: { temperature: true },
    })
  })

  it('sends one switch exactly as the fixture records it', () => {
    expect(preferenceRequest('ada', 'eng', NotificationType.TEMPERATURE, false)).toEqual(
      wire.requests[0]!.body,
    )
  })

  it('offers a switch for exactly the metrics the server accepts, in its order', () => {
    const misspelt = wire.rejected.find((r) => r.name === 'a misspelt type')!
    expect(Object.values(NotificationType)).toEqual(misspelt.reason.split(': ')[1]!.split(', '))
  })
})
