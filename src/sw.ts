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

/**
 * The offline landing. Bumping OFFLINE_VERSION busts the cached copy on the
 * next worker install.
 *
 * /offline is static, unauthenticated, and holds no user data — so caching it
 * does not breach the "never serve one user's cache to another session" rule
 * the catch-all below enforces for everything else. Before this existed, an
 * installed app launched with no network showed the browser's error page,
 * which for something in a Dock reads as "the app is broken", not "I'm
 * offline".
 */
const OFFLINE_VERSION = 1
const OFFLINE_CACHE = 'capsule-offline-shell'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  )
})

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

  // Navigations fall back to the offline shell only when the network is truly
  // unreachable. Serwist's handlers run on the same event; respondWith here
  // wins for navigations because this listener is registered first.
  if (request.mode === 'navigate') {
    // Serwist's own fetch listener registers after this one and would call
    // respondWith again — which throws once the event is already responded to.
    // Stop it seeing the event at all.
    event.stopImmediatePropagation()
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse
          if (preload) return preload as Response
          return await fetch(request)
        } catch {
          const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
          return cached ?? Response.error()
        }
      })(),
    )
    return
  }

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
