export interface Notification {
  message: string
  type?: 'info' | 'alert' | 'critical'
}

export enum NotificationType {
  TEMPERATURE = 'temperature',
}

export interface ISubscriptionPreference {
  notificationType: NotificationType
  isSubscribed: boolean
}

export interface NotificationSubscription {
  accountName: string
  domainName: string
  preferences: ISubscriptionPreference[]
  createdAt: string
}
