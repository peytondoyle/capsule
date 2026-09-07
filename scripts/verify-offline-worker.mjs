import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const manifest = JSON.parse(await readFile('public/offline-assets/manifest.json', 'utf8'))
const files = new Map(await Promise.all(manifest.assets.map(async (asset) => [asset.url, await readFile(`public${asset.url}`)])))
const listeners = new Map(), stores = new Map(), queued = []
const cache = (name) => { if (!stores.has(name)) stores.set(name, new Map()); const entries = stores.get(name); return { match: async (request) => entries.get(typeof request === 'string' ? request : new URL(request.url).pathname)?.clone(), put: async (request, response) => entries.set(typeof request === 'string' ? request : new URL(request.url).pathname, response.clone()) } }
let online = true
const caches = { open: async (name) => cache(name), keys: async () => [...stores.keys()], match: async (request, { cacheName } = {}) => cacheName ? cache(cacheName).match(request) : undefined }
const fetch = async (request) => { const path = new URL(typeof request === 'string' ? request : request.url, 'https://capsule.test').pathname; if (!online) throw new Error('offline'); const body = files.get(path); return body ? new Response(body, { status: 200 }) : new Response('network', { status: 200 }) }
const self = { location: { origin: 'https://capsule.test' }, addEventListener: (type, handler) => listeners.set(type, handler), registration: { scope: 'https://capsule.test/' }, clients: { claim() {}, matchAll: async () => [], openWindow() {} } }
const serwist = { Serwist: class { addEventListeners() {} }, BackgroundSyncQueue: class { async pushRequest(value) { queued.push(value) } }, CacheFirst: class {}, ExpirationPlugin: class {}, NetworkOnly: class {}, StaleWhileRevalidate: class {} }
class WorkerRequest extends Request { constructor(input, init) { super(typeof input === 'string' && input.startsWith('/') ? `https://capsule.test${input}` : input, init) } }
const code = transformSync(await readFile('src/sw.ts', 'utf8'), { loader: 'ts', format: 'cjs', define: { __OFFLINE_ASSETS__: JSON.stringify(manifest.assets), __OFFLINE_DIGEST__: JSON.stringify(manifest.digest) } }).code
vm.runInNewContext(code, { self, caches, fetch, Request: WorkerRequest, Response, URL, crypto: webcrypto, console, require: (name) => name === 'serwist' ? serwist : (() => { throw new Error(name) })() })
const event = (request) => { const waits = [], replies = []; return { request, preloadResponse: Promise.resolve(undefined), ports: [{ postMessage: (value) => replies.push(value) }], waitUntil: (value) => waits.push(value), respondWith(value) { this.responses ??= []; this.responses.push(value) }, stopImmediatePropagation() { this.stopped = true }, async done() { await Promise.all(waits); return this.responses?.[0] && await this.responses[0] }, replies } }
online = false; let install = event(); listeners.get('install')(install); await assert.rejects(install.done()); assert.equal(stores.size, 1); assert.equal([...stores.values()][0].size, 0)
online = true
const cssUrl = manifest.assets[1].url, originalCss = files.get(cssUrl)
files.set(cssUrl, Buffer.from('stale deployment bytes'))
install = event(); listeners.get('install')(install); await assert.rejects(install.done(), /offline shell incomplete/)
assert.equal([...stores.values()][0].size, 0, 'wrong hashes must not populate the shell cache')
files.set(cssUrl, originalCss)
install = event(); listeners.get('install')(install); await install.done(); const current = `capsule-offline-shell-v${manifest.digest}`; assert.equal(stores.get(current).size, 3)
let ready = event(); ready.data = { type: 'OFFLINE_READY' }; listeners.get('message')(ready); await ready.done(); assert.equal(ready.replies[0].ready, true)
stores.get(current).delete(manifest.assets[1].url); ready = event(); ready.data = { type: 'OFFLINE_READY' }; listeners.get('message')(ready); await ready.done(); assert.equal(ready.replies[0].ready, false)
ready = event(); ready.data = { type: 'PREPARE_OFFLINE' }; listeners.get('message')(ready); await ready.done(); assert.equal(ready.replies[0].ready, true)
assert.ok(stores.get(current).has(cssUrl), 'preparation must repair missing shell assets')
await cache(current).put(manifest.assets[1].url, new Response(files.get(manifest.assets[1].url))); online = false
let fetchEvent = event({ url: 'https://capsule.test/anything', mode: 'navigate', method: 'GET' }); listeners.get('fetch')(fetchEvent); assert.match(await (await fetchEvent.done()).text(), /root/)
fetchEvent = event(new Request(`https://capsule.test${manifest.assets[1].url}`)); listeners.get('fetch')(fetchEvent); assert.ok((await fetchEvent.done()).ok)
fetchEvent = event(new Request(`https://capsule.test${manifest.assets[2].url}`)); listeners.get('fetch')(fetchEvent); assert.ok((await fetchEvent.done()).ok)
stores.get(current).delete(cssUrl); online = true
fetchEvent = event(new Request(`https://capsule.test${cssUrl}`)); listeners.get('fetch')(fetchEvent); assert.ok((await fetchEvent.done()).ok)
assert.equal(await stores.get(current).get(cssUrl).text(), originalCss.toString(), 'online requests repair missing assets')
online = false
const oldBody = 'old shell'; const oldHash = createHash('sha256').update(oldBody).digest('hex').slice(0, 12)
await cache('capsule-offline-shell-vold').put(`/offline-assets/offline-${oldHash}.js`, new Response(oldBody))
fetchEvent = event(new Request(`https://capsule.test/offline-assets/offline-${oldHash}.js`)); listeners.get('fetch')(fetchEvent); assert.ok((await fetchEvent.done()).ok)
fetchEvent = event(new Request('https://capsule.test/api/derive', { method: 'POST', body: 'x' })); listeners.get('fetch')(fetchEvent); assert.equal(fetchEvent.responses.length, 1); assert.equal((await fetchEvent.done()).status, 202); assert.equal(queued.length, 1)
assert.equal(fetchEvent.stopped, true)
fetchEvent = event(new Request('https://capsule.test/api/private')); listeners.get('fetch')(fetchEvent); assert.equal(fetchEvent.responses, undefined)
fetchEvent = event(new Request('https://other.test/api/derive', { method: 'POST' })); listeners.get('fetch')(fetchEvent); assert.equal(fetchEvent.responses, undefined)
console.log('verify-offline-worker: passed')
