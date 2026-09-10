import type { Notification as NotificationModel } from '@/models/notification.ts'

export type Notification = NotificationModel & { read: boolean }

export interface ServerToClientEvents {
  notification: (data: NotificationModel) => void
  telemetry: (data: unknown) => void
}

export interface ClientToServerEvents {
  subscribe_building: (buildingId: string) => void
  unsubscribe_building: (buildingId: string) => void
}
