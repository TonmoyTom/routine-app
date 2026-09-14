/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

interface Payload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let p: Payload = {}
  try {
    p = event.data?.json() ?? {}
  } catch {
    p = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(p.title ?? 'Routine', {
      body: p.body ?? '',
      tag: p.tag,
      // replace a stale reminder of the same kind rather than stacking
      renotify: !!p.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: p.url ?? '/' },
      actions: [{ action: 'open', title: 'Open' }]
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) ?? '/'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      // reuse the open tab if there is one, rather than piling up windows
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).navigate(url).catch(() => {})
          return (c as WindowClient).focus()
        }
      }
      return self.clients.openWindow(url)
    })()
  )
})

// endpoints rotate; without this the server keeps pushing into a dead one
self.addEventListener('pushsubscriptionchange', (event: any) => {
  event.waitUntil(
    (async () => {
      const sub = await self.registration.pushManager.subscribe(
        event.oldSubscription?.options ?? { userVisibleOnly: true }
      )
      const all = await self.clients.matchAll({ includeUncontrolled: true })
      for (const c of all) {
        c.postMessage({ type: 'push-resubscribed', subscription: sub.toJSON() })
      }
    })()
  )
})
