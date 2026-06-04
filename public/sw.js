/* daylo. service worker — push notifications + offline cache */

const CACHE_NAME = 'daylo-shell-v2'
const SHELL_URLS = ['/', '/index.html']

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => {})
  )
})

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: network-first for API/uploads, cache-first for shell ───────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return

  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
        }
        return response
      }).catch(() => cached)
      return cached ?? networkFetch
    })
  )
})

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'daylo.', body: 'Du hast eine neue Benachrichtigung.' }
  try { data = event.data?.json() ?? data } catch {}

  // Unique tag per notification so they all appear separately
  const tag = `daylo-${data.title}-${Date.now()}`

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-512.svg',
      badge:   '/icon-512.svg',
      vibrate: [100, 50, 100],
      tag,
      renotify: true,
      data:    { url: data.url ?? '/' },
    })
  )
})

// ── Notification click: focus or open app ─────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => new URL(c.url).origin === self.location.origin)
      if (existing) return existing.focus().then(w => w.navigate(targetUrl))
      return clients.openWindow(targetUrl)
    })
  )
})
