import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi.ts'
import { type NotificationSubscription, NotificationType } from '@/models/notification.ts'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notificationPreferences: {} as Record<string, Record<string, boolean>>,
  }),

  getters: {
    isSubscribed:
      (state) =>
      (domainName: string, type: NotificationType = NotificationType.TEMPERATURE) => {
        return state.notificationPreferences[domainName]?.[type] ?? false
      },
  },

  actions: {
    async fetchAccountNotificationPreference(accountName: string) {
      const response = await makeRequest(`/notification/preferences/${accountName}`)
      const data = await response.json()

      if (!response.ok) {
        console.error(`Failed to fetch preferences: ${data.type} - ${data.message}`)
        return
      }

      this.notificationPreferences = {}

      data.accountPreferences.forEach((subscription: NotificationSubscription) => {
        let domainPrefs = this.notificationPreferences[subscription.domainName]
        if (!domainPrefs) {
          domainPrefs = {}
          this.notificationPreferences[subscription.domainName] = domainPrefs
        }

        // Safely iterate and assign to the local reference
        ;(subscription.preferences || []).forEach((pref) => {
          domainPrefs[pref.notificationType] = pref.isSubscribed
        })
      })
    },

    async handleNotificationSubscription(
      accountName: string,
      domainName: string,
      type: NotificationType = NotificationType.TEMPERATURE, // Default to temperature for UI backward compatibility
    ) {
      const currentValue = this.isSubscribed(domainName, type)

      const response = await makeRequest('/notification/preferences', 'POST', {
        body: JSON.stringify({
          accountName,
          domainName,
          type,
          enabled: !currentValue,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error(`Failed to update preference: ${data.type} - ${data.message}`)
        return
      }

      // Optimistically update the UI store
      if (!this.notificationPreferences[domainName]) {
        this.notificationPreferences[domainName] = {}
      }
      this.notificationPreferences[domainName][type] = !currentValue
    },
  },
})
