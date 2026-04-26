export interface Notification {
  message: string
  type?: 'info' | 'alert' | 'critical'
}

export interface NotificationSubscription {
  accountName: string
  domainName: string
  createdAt: string
}
