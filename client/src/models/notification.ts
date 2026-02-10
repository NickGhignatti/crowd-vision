export interface NotificationPayload {
    message: string
    type?: 'info' | 'alert' | 'critical'
}