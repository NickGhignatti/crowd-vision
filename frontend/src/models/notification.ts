export type Severity = 'info' | 'warning' | 'danger'

export interface Notification {
  id: string
  type: Severity
  title: string
  message: string
  timestamp: string
  domainName?: string
  metric?: string
  icon?: string
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
