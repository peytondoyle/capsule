import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const runtime = process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'
const require = createRequire(`${runtime}/package.json`)
const { indexedDB, IDBKeyRange } = require('fake-indexeddb')
globalThis.indexedDB = indexedDB
globalThis.IDBKeyRange = IDBKeyRange
globalThis.crypto ??= require('node:crypto').webcrypto
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, callback) => callback({}) } }, configurable: true })

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-sync-`)
buildSync({ entryPoints: ['src/lib/offline/sync.ts'], bundle: true, format: 'esm', outfile: `${outdir}/sync.mjs`, platform: 'node' })
buildSync({ entryPoints: ['src/lib/offline/store.ts'], bundle: true, format: 'esm', outfile: `${outdir}/store.mjs`, platform: 'node' })
const { syncArchive } = await import(`${outdir}/sync.mjs`)
const store = await import(`${outdir}/store.mjs`)

const snapshot = (ownerId) => ({ version: 1, ownerId, records: [], faces: [], people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], pendingIntake: [], tombstones: [] })
const mutation = (clientId) => ({ type: 'object.create', clientId, values: { title: clientId } })
const save = async (ownerId, clientId) => {
  return store.saveOperation(ownerId, mutation(clientId))
}
const originalFetch = globalThis.fetch
const active = () => true

await save('alice', 'failure')
globalThis.fetch = async () => { throw new Error('offline') }
await assert.rejects(syncArchive('alice', { isActiveOwner: active }))
let entries = await store.listOperations('alice')
assert.equal(entries.length, 1)
const stableId = entries[0].operationId

let posts = 0
globalThis.fetch = async (_url, init) => {
  if (init?.method === 'POST') { posts++; return new Response(JSON.stringify({ operationId: stableId, outcome: 'applied' }), { status: 200 }) }
  throw new Error('refresh failed')
}
await assert.rejects(syncArchive('alice', { isActiveOwner: active }))
assert.equal((await store.listOperations('alice'))[0].operationId, stableId)
assert.equal(posts, 1)
globalThis.fetch = async (_url, init) => init?.method === 'POST'
  ? new Response(JSON.stringify({ operationId: stableId, outcome: 'applied' }), { status: 200 })
  : new Response(JSON.stringify(snapshot('alice')), { status: 200 })
await syncArchive('alice', { isActiveOwner: active })
assert.equal((await store.listOperations('alice')).length, 0, 'acknowledged operation is removed after refresh')
assert.equal(posts, 1, 'lost acknowledgement retry must reuse the same operation, not create another')

await save('alice', 'conflict')
await save('alice', 'later')
let conflictId
globalThis.fetch = async (_url, init) => {
  if (init?.method === 'POST') {
    const body = JSON.parse(init.body)
    conflictId ??= body.operationId
    return new Response(JSON.stringify({ operationId: body.operationId, outcome: body.operationId === conflictId ? 'conflict' : 'applied' }), { status: 200 })
  }
  return new Response(JSON.stringify(snapshot('alice')), { status: 200 })
}
const conflictResult = await syncArchive('alice', { isActiveOwner: active })
assert.equal(conflictResult.status, 'conflict')
assert.equal((await store.listOperations('alice')).length, 2, 'conflict and later operations stay queued')

await save('bob', 'wrong-snapshot')
globalThis.fetch = async (_url, init) => init?.method === 'POST'
  ? new Response(JSON.stringify({ operationId: JSON.parse(init.body).operationId, outcome: 'applied' }), { status: 200 })
  : new Response(JSON.stringify(snapshot('alice')), { status: 200 })
assert.equal((await syncArchive('bob', { isActiveOwner: active })).status, 'locked')
assert.equal(await store.readArchive('bob'), undefined, 'wrong-owner snapshot is never stored')

for (const status of [401, 409]) {
  await save('status-owner', `status-${status}`)
  globalThis.fetch = async () => new Response('', { status })
  assert.equal((await syncArchive('status-owner', { isActiveOwner: active })).status, 'locked')
}

let current = true
await save('changing-owner', 'in-flight')
globalThis.fetch = async () => {
  current = false
  return new Response(JSON.stringify({ operationId: (await store.listOperations('changing-owner'))[0].operationId, outcome: 'applied' }), { status: 200 })
}
assert.equal((await syncArchive('changing-owner', { isActiveOwner: () => current })).status, 'locked')
assert.equal((await store.listOperations('changing-owner')).length, 1, 'owner change retains in-flight operation')

globalThis.navigator.locks = { request: async (_name, _options, callback) => callback(null) }
assert.equal((await syncArchive('alice', { isActiveOwner: active })).status, 'busy')
globalThis.fetch = originalFetch
console.log('offline sync verification passed: retries, conflicts, ownership, auth stops, and lock coordination')
rmSync(outdir, { recursive: true, force: true })
