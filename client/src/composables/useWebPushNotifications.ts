import { ref } from 'vue'
import { makeRequest } from '@/composables/useApi.ts'

export function useWebPushNotifications() {
  // Detects if the browser supports both Service Workers and the Push API
  const isSupported = ref('serviceWorker' in navigator && 'PushManager' in window)
  const permission = ref(Notification.permission)
  const isSubscribed = ref(false)

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const areKeysEqual = (serverKeyB64: string, localKeyArray: ArrayBuffer | null) => {
    if (!localKeyArray) return false
    const localKeyB64 = btoa(String.fromCharCode(...new Uint8Array(localKeyArray)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '') // URL-Safe Base64
    return localKeyB64 === serverKeyB64
  }

  const subscribe = async (accountName?: string) => {
    if (!isSupported.value) return

    try {
      const keyResponse = await makeRequest(`/notification/public-key`)
      const data = await keyResponse.json()

      if (!keyResponse.ok){
        console.log(`Failed to fetch VAPID key: ${data.type} - ${data.message}`)
        return
      }

      const register = await navigator.serviceWorker.register('/service-worker.js')
      let subscription = await register.pushManager.getSubscription()

      // If is present an old subscription with different keys I have to update the server key
      if (subscription) {
        const currentKey = subscription.options.applicationServerKey
        if (!areKeysEqual(data.publicVapidKey, currentKey)) {
          await subscription.unsubscribe()
          subscription = null
        }
      }

      if (!subscription) {
        subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicVapidKey),
        })
      }

      if (accountName) {
        const payload = {
          accountName,
          subscription: subscription.toJSON ? subscription.toJSON() : subscription,
        }

        const response = await makeRequest(`/notification/subscribe`, 'POST', {
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.log(`Failed to subscribe: ${errorData.type} - ${errorData.message}`)
          return
        }

        isSubscribed.value = true
        permission.value = 'granted'
        return
      }

      console.log('Push subscription created locally, but accountName is missing so it was not persisted.')
    } catch {
      permission.value = 'denied'
    }
  }

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
  }
}
