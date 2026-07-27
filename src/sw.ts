/// <reference lib="webworker" />
/**
 * Compiled to public/sw.js by esbuild (npm run build:sw) — option C from the
 * Serwist × Next 16 investigation: Serwist's runtime classes without its
 * webpack plugin, so Turbopack stays the app builder.
 *
 * No precache manifest by design. The app shell is auth-gated and served
 * per-user, so "precache the shell" would cache a redirect; runtime strategies
 * carry the offline story instead.
 */
import { BackgroundSyncQueue, CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Blob derivatives are content-addressed by pathname and overwritten in
      // place only by re-derives; a day of cache is safe and makes the
      // timeline instant offline.
      matcher: ({ url }) => url.hostname.endsWith('.public.blob.vercel-storage.com'),
      handler: new CacheFirst({
        cacheName: 'capsule-derivatives',
        plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new StaleWhileRevalidate({ cacheName: 'capsule-static' }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/icons/'),
      handler: new CacheFirst({ cacheName: 'capsule-icons' }),
    },
    // Everything else — pages, RSC payloads, API — stays network-only:
    // an authed archive must never serve one user's cache to another session.
    { matcher: () => true, handler: new NetworkOnly() },
  ],
})

/**
 * Derive/extract calls that fail offline are replayed when connectivity
 * returns. Uploads themselves cannot be queued here (the bytes go client →
 * Blob directly); the uploader parks those files in IndexedDB instead.
 */
const pipelineQueue = new BackgroundSyncQueue('capsule-pipeline', {
  maxRetentionTime: 60 * 24 * 7,
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (
    request.method === 'POST' &&
    (request.url.includes('/api/derive') || request.url.includes('/api/extract'))
  ) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await pipelineQueue.pushRequest({ request })
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
  }
})

serwist.addEventListeners()
