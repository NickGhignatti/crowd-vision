import { defineStore } from 'pinia'
import { makeRequest } from '@/composables/useApi.ts'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notificationAreEnabled: true
  }),

  actions: {
    async handleNotificationSubscription(accountName: string, domainName: string) {
      const response = await makeRequest('/notification/preferences', 'POST', {
        body: JSON.stringify({
          userId: accountName,
          domainId: domainName,
          enabled: !this.notificationAreEnabled,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        console.log(`Failed to subscribe/unsubscribe: ${data.type} - ${data.message}`)
      }
    }
  }
})
