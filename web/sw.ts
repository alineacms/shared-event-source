import {handler} from './handler'

declare let self: ServiceWorkerGlobalScope

// Listen for all fetch events.
self.addEventListener('fetch', event => {
  const {request} = event
  const url = new URL(request.url)
  if (url.pathname === '/sse') event.respondWith(handler(event.request))
})

// Force the waiting service worker to become the active service worker.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Take control of all pages under this service worker's scope immediately.
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})
