import type { Notification as NotificationModel } from '@/models/notification.ts'

export interface Notification {
  id: string
  message: string
  type: 'info' | 'alert' | 'critical'
  timestamp: Date
  read: boolean
}

export interface ServerToClientEvents {
  notification: (data: NotificationModel) => void
  telemetry: (data: unknown) => void
}

export interface ClientToServerEvents {
  subscribe_building: (buildingId: string) => void
  unsubscribe_building: (buildingId: string) => void
}
