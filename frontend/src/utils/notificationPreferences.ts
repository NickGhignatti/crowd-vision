import type { NotificationSubscription, NotificationType } from '@/models/notification.ts'

export type PreferenceMap = Record<string, Record<string, boolean>>

export const toPreferenceMap = (records: NotificationSubscription[]): PreferenceMap =>
  Object.fromEntries(
    records.map((record) => [
      record.domainName,
      Object.fromEntries(
        (record.preferences ?? []).map((pref) => [pref.notificationType, pref.isSubscribed]),
      ),
    ]),
  )

export const preferenceRequest = (
  accountName: string,
  domainName: string,
  type: NotificationType,
  enabled: boolean,
) => ({ accountName, domainName, type, enabled })
