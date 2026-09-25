import type { Notification } from '@/types/commons/notification.ts'

export interface ServerToClientEvents {
  notification: (data: Notification) => void
  telemetry: (data: unknown) => void
}

export interface ClientToServerEvents {
  subscribe_building: (buildingId: string) => void
  unsubscribe_building: (buildingId: string) => void
}
