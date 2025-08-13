import {handler} from './handler'

declare let self: ServiceWorkerGlobalScope

// Listen for all fetch events.
self.addEventListener('fetch', event => {
  handler(event.request).then(response => {
    if (response.ok) event.respondWith(response)
  })
})

// Force the waiting service worker to become the active service worker.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Take control of all pages under this service worker's scope immediately.
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})
