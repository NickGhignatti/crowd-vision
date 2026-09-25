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
  // No metric or no domain means no switch to consult: a manual alert or a system-wide message.
  !notification.metric ||
  !notification.domainName ||
  preferences[notification.domainName]?.[notification.metric] === true
