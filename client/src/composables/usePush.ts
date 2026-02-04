import { ref } from 'vue'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export function usePush() {
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

  const subscribe = async () => {
    if (!isSupported.value) return

    try {
      const keyResponse = await fetch(`${SERVER_URL}/notification/public-key`)
      if (!keyResponse.ok) throw new Error('Could not fetch VAPID key')
      const { publicVapidKey } = await keyResponse.json()

      const register = await navigator.serviceWorker.register('/service-worker.js')
      let subscription = await register.pushManager.getSubscription()

      if (subscription) {
        const currentKey = subscription.options.applicationServerKey
        if (!areKeysEqual(publicVapidKey, currentKey)) {
          console.warn('⚠️ Key Mismatch detected! Resubscribing...')
          await subscription.unsubscribe()
          subscription = null
        }
      }

      if (!subscription) {
        subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        })
      }

      const response = await fetch(`${SERVER_URL}/notification/subscribe`, {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      isSubscribed.value = true
      permission.value = 'granted'
    } catch (error) {
      console.error('❌ Failed to subscribe:', error)
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
