import type {Notification as NotificationModel} from '@/models/notification.ts'

export interface Notification {
  id: string
  message: string
  type: 'info' | 'alert' | 'critical'
  timestamp: Date
  read: boolean
}

export interface ServerToClientEvents {
  notification: (data: NotificationModel) => void
}

export interface ClientToServerEvents {
  join_room: (userId: string) => void
}
