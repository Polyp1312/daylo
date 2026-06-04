/* daylo. service worker — push notifications + offline cache */

const CACHE_NAME = 'daylo-shell-v3'
const SHELL_URLS = ['/']

// ── Install: skip waiting so new SW takes over immediately ────────────────────
self.addEventListener('install', event => {
  self.skipWaiting()   // take over without waiting for old tabs to close
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => {})
  )
})

// ── Activate: claim all clients + delete every old cache ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))   // wipe ALL caches
      .then(() => self.clients.claim())                               // take over all tabs
      .then(() => {
        // Tell every open tab to reload so they get the fresh app
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(c => c.navigate(c.url))
        })
      })
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
