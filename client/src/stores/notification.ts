import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi.ts'
import type { NotificationSubscription } from '@/models/notification.ts'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notificationPreferences: {} as Record<string, boolean>,
  }),

  getters: {
    isSubscribed: (state) => (domainName: string) => {
      console.log(`Checking subscription for ${domainName}:`, state.notificationPreferences[domainName])
      return state.notificationPreferences[domainName] ?? false
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

      data.accountPreferences.forEach((preference: NotificationSubscription) => {
        this.notificationPreferences[preference.domainName] = true
      })
    },

    async handleNotificationSubscription(accountName: string, domainName: string) {
      const currentValue = this.notificationPreferences[domainName] ?? false

      const response = await makeRequest('/notification/preferences', 'POST', {
        body: JSON.stringify({
          accountName,
          domainName,
          enabled: !currentValue,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error(`Failed to update preference: ${data.type} - ${data.message}`)
        return
      }

      this.notificationPreferences[domainName] = !currentValue
      console.log(this.notificationPreferences)
    },
  },
})
