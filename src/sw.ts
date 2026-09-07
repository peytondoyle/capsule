/// <reference lib="webworker" />
/**
 * Compiled to public/sw.js by esbuild (npm run build:sw) — option C from the
 * Serwist × Next 16 investigation: Serwist's runtime classes without its
 * webpack plugin, so Turbopack stays the app builder.
 *
 * Only the standalone, account-free capture shell is precached. Authenticated
 * pages and API responses remain network-only.
 */
import { BackgroundSyncQueue, CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

declare const self: ServiceWorkerGlobalScope
declare const __OFFLINE_ASSETS__: Array<{ url: string; sha256: string }>
declare const __OFFLINE_DIGEST__: string

const OFFLINE_VERSION = __OFFLINE_DIGEST__
const OFFLINE_CACHE = `capsule-offline-shell-v${OFFLINE_VERSION}`
const OFFLINE_URL = '/offline.html'

async function digest(response: Response) {
  const bytes = await response.clone().arrayBuffer()
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function shellReady() {
  const cache = await caches.open(OFFLINE_CACHE)
  for (const asset of __OFFLINE_ASSETS__) {
    const response = await cache.match(asset.url)
    if (!response || await digest(response) !== asset.sha256) return false
  }
  return true
}

async function shellAsset(request: Request, path: string) {
  const asset = __OFFLINE_ASSETS__.find((entry) => entry.url === path)
  const oldHash = /^\/offline-assets\/offline-([a-f0-9]{12})\.(js|css)$/.exec(path)?.[1]
  const valid = async (response: Response) => {
    if (!response.ok) return false
    const hash = await digest(response)
    return asset ? hash === asset.sha256 : !!oldHash && hash.startsWith(oldHash)
  }
  const names = [OFFLINE_CACHE, ...(await caches.keys()).filter((name) => name !== OFFLINE_CACHE && name.startsWith('capsule-offline-shell-v'))]
  for (const name of names) {
    const cached = await caches.match(path, { cacheName: name })
    if (cached && await valid(cached)) return cached
  }
  const response = await fetch(request)
  if (!await valid(response)) return Response.error()
  await (await caches.open(OFFLINE_CACHE)).put(path, response.clone())
  return response
}

async function prepareShell() {
  if (await shellReady()) return
  const cache = await caches.open(OFFLINE_CACHE)
  const responses = await Promise.all(__OFFLINE_ASSETS__.map((asset) => fetch(new Request(asset.url, { cache: 'reload' }))))
  if (responses.some((response) => !response.ok) || !(await Promise.all(responses.map(digest))).every((hash, index) => hash === __OFFLINE_ASSETS__[index]!.sha256)) throw new Error('offline shell incomplete')
  await Promise.all(responses.map((response, index) => cache.put(__OFFLINE_ASSETS__[index]!.url, response)))
}

self.addEventListener('install', (event) => { event.waitUntil(prepareShell()) })

const serwist = new Serwist({
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Derivatives have immutable random-suffixed paths.
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
  const url = new URL(request.url)

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

  if (request.method === 'GET' && url.origin === self.location.origin && (__OFFLINE_ASSETS__.some((asset) => asset.url === url.pathname) || /^\/offline-assets\/offline-[a-f0-9]{12}\.(js|css)$/.test(url.pathname))) {
    event.stopImmediatePropagation()
    event.respondWith(shellAsset(request, url.pathname))
    return
  }

  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    (url.pathname === '/api/derive' || url.pathname === '/api/extract')
  ) {
    event.stopImmediatePropagation()
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

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'OFFLINE_READY' && event.data?.type !== 'PREPARE_OFFLINE') return
  event.waitUntil((async () => {
    let ready = false
    try {
      if (event.data.type === 'PREPARE_OFFLINE') await prepareShell()
      ready = await shellReady()
    } catch { /* Incomplete storage must never be reported as prepared. */ }
    const recipient = event.ports[0] ?? event.source
    recipient?.postMessage({ type: 'OFFLINE_READY', ready, digest: __OFFLINE_DIGEST__ })
  })())
})

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as { title?: string; body?: string; url?: string } | undefined
  event.waitUntil(
    self.registration.showNotification(payload?.title ?? 'Capsule', {
      body: payload?.body,
      data: { url: payload?.url ?? '/queue' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'capsule-unfiled',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/queue'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const windows = clients as WindowClient[]
      const match = windows.find((client) => new URL(client.url).pathname === url)
      return match ? match.focus() : self.clients.openWindow(url)
    }),
  )
})

serwist.addEventListeners()
