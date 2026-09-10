self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}

  const options = {
    body: data.message,
    ...(data.icon && { icon: data.icon }),
    badge: '/favicon.ico',
    tag: 'crowdvision-alert', // Prevents stacking multiple alerts
    renotify: true,
    data: {
      url: self.location.origin, // Click opens the dashboards
    },
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
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
