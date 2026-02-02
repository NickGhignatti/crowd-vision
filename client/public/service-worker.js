self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}

  const title = data.title || 'CrowdVision Alert'
  const options = {
    body: data.message || 'New critical update available.',
    icon: '/favicon.ico', // Ensure you have an icon here
    badge: '/favicon.ico',
    tag: 'crowdvision-alert', // Prevents stacking multiple alerts
    renotify: true,
    data: {
      url: self.location.origin, // Click opens the dashboard
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {

      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    }),
  )
})
