import type { Notification as Wire, Severity } from '@/models/notification.ts'
import type { Notification } from '@/interfaces/notification.ts'
import type { PreferenceMap } from '@/utils/notificationPreferences.ts'

export const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

export const toListItem = (notification: Wire): Notification => ({ ...notification, read: false })

/** Whether the bell shows it: a breach only if the account switched its metric on for that domain. */
export const isVisible = (notification: Wire, preferences: PreferenceMap): boolean =>
  // No metric or no domain means no switch to consult: a manual alert or a system-wide message.
  !notification.metric ||
  !notification.domainName ||
  preferences[notification.domainName]?.[notification.metric] === true
