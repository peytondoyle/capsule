import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const runtime = process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'
const require = createRequire(`${runtime}/package.json`)
const { indexedDB } = require('fake-indexeddb')
globalThis.indexedDB = indexedDB
const values = new Map()
const listeners = new Map()
const window = { addEventListener(type, fn) { const set = listeners.get(type) ?? new Set(); set.add(fn); listeners.set(type, set) }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn) }, dispatchEvent(event) { for (const fn of listeners.get(event.type) ?? []) fn(event) } }
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }, configurable: true })
globalThis.Event = class Event { constructor(type) { this.type = type } }
globalThis.MessageChannel = class MessageChannel { constructor() { this.port1 = { close() {}, onmessage: null }; this.port2 = { _peer: this.port1 } } }
Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { getRegistration: async () => ({ active: { postMessage: (_msg, ports) => setTimeout(() => ports[0]._peer.onmessage?.({ data: { type: 'OFFLINE_READY', ready: globalThis.ready } }), 0) } }) } }, configurable: true })

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-session-`)
buildSync({ entryPoints: ['src/lib/offline/session.ts'], bundle: true, format: 'esm', outfile: `${outdir}/session.mjs`, platform: 'node' })
const session = await import(`${outdir}/session.mjs`)
assert.equal(session.localOwner(), null)
session.rememberLocalOwner('alice')
assert.equal(session.localOwner(), 'alice')
let changed = 0
const unsubscribe = session.watchLocalOwner(() => { changed++ })
window.dispatchEvent(new Event('capsule-local-owner-change'))
assert.equal(changed, 1)
session.lockLocalArchive()
assert.equal(session.localOwner(), null)
assert.equal(changed, 2)
for (const key of ['capsule-local-owner', null]) window.dispatchEvent({ type: 'storage', key })
assert.equal(changed, 4)
unsubscribe()
window.dispatchEvent(new Event('capsule-local-owner-change'))
assert.equal(changed, 4)
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }, configurable: true })
assert.equal(session.localOwner(), null)
await assert.rejects(Promise.resolve().then(() => session.rememberLocalOwner('invented')))

globalThis.ready = true
assert.equal(await session.offlineShellReady(), true)
globalThis.ready = false
assert.equal(await session.offlineShellReady(), false)
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
assert.equal(await session.offlineShellReady(), false)

function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: sandboxModule, exports: sandboxModule.exports,
    require(name) { assert.ok(name in dependencies, `Unexpected ${name}`); return dependencies[name] },
    Response, Request,
  })
  return sandboxModule.exports
}
const owner = { id: 'alice' }
const route = (user) => load('src/app/api/offline-session/route.ts', { '@/server/auth': { getCurrentUser: async () => user } })
const req = (header) => new Request('https://capsule.test/api/offline-session', { headers: header ? { 'x-capsule-owner': header } : {} })
assert.equal((await route(null).GET(req('alice'))).status, 401)
assert.equal((await route(owner).GET(req('bob'))).status, 409)
const correct = await route(owner).GET(req('alice'))
assert.equal(correct.status, 200)
assert.equal((await correct.json()).ownerId, 'alice')
assert.equal(correct.headers.get('cache-control'), 'private, no-store')
const cannotChoose = await route(owner).GET(req('bob'))
assert.equal(cannotChoose.status, 409)
console.log('offline session verification passed: owner partitioning, lock/watch behavior, storage failure, and shell readiness')
rmSync(outdir, { recursive: true, force: true })
