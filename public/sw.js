/* daylo. service worker — push notifications */

self.addEventListener('push', event => {
  let data = { title: 'daylo.', body: 'Neuer Vlog verfügbar!' }
  try { data = event.data?.json() ?? data } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [100, 50, 100],
      data: { url: '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow('/')
    })
  )
})
