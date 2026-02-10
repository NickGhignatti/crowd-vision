import type { NotificationPayload } from "@/models/notification"

import { io, type Socket } from 'socket.io-client'
import { reactive } from 'vue'

export interface Notification {
  id: string
  message: string
  type: 'info' | 'alert' | 'critical'
  timestamp: Date
  read: boolean
}

interface ServerToClientEvents {
  notification: (data: NotificationPayload) => void
}

interface ClientToServerEvents {
  join_room: (userId: string) => void
}

export const socketState = reactive({
  connected: false,
  notifications: [] as Notification[],
  unreadCount: 0,
})

const URL = import.meta.env.VITE_SERVER_URL || ''

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
  autoConnect: false,
  transports: ['websocket'],
})

socket.on('connect', () => {
  socketState.connected = true
})

socket.on('disconnect', () => {
  socketState.connected = false
})

socket.on('notification', (data) => {
  socketState.notifications.unshift({
    id: Date.now().toString(),
    message: data.message,
    type: data.type || 'info',
    timestamp: new Date(),
    read: false,
  })
  socketState.unreadCount++
})
