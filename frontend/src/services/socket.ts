import { io, type Socket } from 'socket.io-client'
import { reactive } from 'vue'
import { useAuthStore } from '@/stores/authentication'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Notification,
} from '@/interfaces/notification.ts'

export const socketState = reactive({
  connected: false,
  notifications: [] as Notification[],
  unreadCount: 0,
})

const URL = import.meta.env.VITE_SERVER_URL || ''

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
  autoConnect: false,
  transports: ['websocket'],
  withCredentials: true,
})

socket.on('connect', () => {
  socketState.connected = true
})

const RECONNECT_DELAY_MS = 3000
let retryTimer: ReturnType<typeof setTimeout> | undefined

const scheduleReconnect = () => {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    const authStore = useAuthStore()
    void authStore.hydrate(true).then(() => {
      if (authStore.isAuthenticated) socket.connect()
    })
  }, RECONNECT_DELAY_MS)
}

socket.on('disconnect', (reason) => {
  socketState.connected = false
  if (reason === 'io server disconnect') scheduleReconnect()
})

socket.on('connect_error', (error) => {
  console.error('[socket] connect_error', error)
  scheduleReconnect()
})

socket.on('notification', (data) => {
  socketState.notifications.unshift({
    id: Date.now().toString(),
    message: data.message,
    type: data.type || 'info',
    timestamp: new Date(),
    read: false,
  })
  if (socketState.notifications.length > 100) socketState.notifications.length = 100
  socketState.unreadCount++
})
