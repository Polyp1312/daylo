/* daylo. service worker — push notifications + offline cache */

const CACHE_NAME = 'daylo-shell-v1'
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

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // API and upload requests: network only (never cache)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return

  // App shell: stale-while-revalidate
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
  let data = { title: 'daylo.', body: 'Neuer Vlog verfügbar!' }
  try { data = event.data?.json() ?? data } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      vibrate: [100, 50, 100],
      tag:     'daylo-notification',
      renotify: false,
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
      // Focus existing window if already open
      const existing = list.find(c => new URL(c.url).origin === self.location.origin)
      if (existing) return existing.focus().then(w => w.navigate(targetUrl))
      return clients.openWindow(targetUrl)
    })
  )
})
