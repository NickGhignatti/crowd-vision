import type {
  Notification as Wire,
  NotificationListItem as Notification,
  Severity,
} from '@/types/commons/notification.ts'
import type { Tone } from '@/utils/commons/tone.ts'
import type { PreferenceMap } from '@/utils/commons/notificationPreferences.ts'

export const SEVERITY_TONE: Record<Severity, Tone> = {
  info: 'tertiary',
  warning: 'warning',
  danger: 'danger',
}

export const toListItem = (notification: Wire): Notification => ({ ...notification, read: false })

/** Whether the bell shows it: a breach only if the account switched its metric on for that domain. */
export const isVisible = (notification: Wire, preferences: PreferenceMap): boolean =>
  // No metric means a manual alert: there is no switch to consult.
  !notification.metric ||
  preferences[notification.domainName]?.[notification.metric] === true
