import type { Notification as Wire, Severity } from '@/models/notification.ts'
import type { Notification } from '@/interfaces/notification.ts'

export const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

export const toListItem = (notification: Wire): Notification => ({ ...notification, read: false })
