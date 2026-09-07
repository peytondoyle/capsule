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

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-store-`)
buildSync({ entryPoints: ['src/lib/offline/store.ts'], bundle: true, format: 'esm', outfile: `${outdir}/store.mjs`, platform: 'node' })
buildSync({ entryPoints: ['src/lib/offline-queue.ts'], bundle: true, format: 'esm', outfile: `${outdir}/queue.mjs`, platform: 'node' })
const store = await import(`${outdir}/store.mjs`)
const queue = await import(`${outdir}/queue.mjs`)

const snapshot = (ownerId, records = []) => ({ version: 1, ownerId, records, faces: [], people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], tombstones: [] })
const mutation = (clientId) => ({ type: 'object.create', clientId, values: { title: clientId } })
const media = (id, text) => ({ id, bytes: new Blob([text], { type: 'text/plain' }), name: `${id}.txt`, type: 'text/plain', createdAt: Date.now() })

const sameName = (text) => new File([text], 'image.jpg', { type: 'image/jpeg' })
const aliceKey = await queue.enqueueUpload('alice', sameName('alice'))
const bobKey = await queue.enqueueUpload('bob', sameName('bob'))
assert.equal((await queue.listQueued('alice')).length, 1)
assert.equal((await queue.listQueued('bob')).length, 1)
assert.equal(await (await queue.listQueued('alice'))[0].bytes.text(), 'alice')
await queue.removeQueued(aliceKey)
assert.equal((await queue.listQueued('alice')).length, 0)
assert.equal((await queue.listQueued('bob'))[0].key, bobKey)

const queuePrototype = Object.getPrototypeOf((await new Promise((resolve, reject) => {
  const request = indexedDB.open('capsule-offline')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})).transaction('pending-uploads', 'readwrite').objectStore('pending-uploads'))
const originalQueueAdd = queuePrototype.add
let queueAbort = false
queuePrototype.add = function (...args) {
  const request = originalQueueAdd.apply(this, args)
  if (!queueAbort) {
    queueAbort = true
    request.addEventListener('success', () => this.transaction.abort())
  }
  return request
}
await assert.rejects(queue.enqueueUpload('alice', sameName('rollback')))
queuePrototype.add = originalQueueAdd
assert.equal((await queue.listQueued('alice')).length, 0, 'aborted queue write must not persist')

await store.replaceSnapshot('alice', snapshot('alice'))
await store.replaceSnapshot('bob', snapshot('bob'))
await assert.rejects(store.replaceSnapshot('alice', snapshot('bob')), /another account/)
await store.saveOperation('alice', mutation('a1'), [media('m1', 'bytes')])
await store.saveOperation('bob', mutation('b1'), [media('m1', 'other')])
assert.equal((await store.listOperations('alice')).length, 1)
assert.equal((await store.listOperations('bob')).length, 1)
assert.equal(await (await store.readMedia('alice', 'm1')).bytes.text(), 'bytes')
assert.equal(await (await store.readMedia('bob', 'm1')).bytes.text(), 'other')
assert.equal((await store.exportPending('alice')).media.length, 1)

const before = await store.listOperations('alice')
const response = { operationId: before[0].operationId, outcome: 'applied' }
await store.recordResponse('alice', response)
await store.replaceSnapshot('alice', snapshot('alice', [{ id: 'a1', revision: 1 }]), [response.operationId])
assert.equal((await store.listOperations('alice')).length, 0)

await store.saveOperation('alice', mutation('keep'), [])
await store.replaceSnapshot('alice', snapshot('alice'), [])
assert.equal((await store.listOperations('alice')).length, 1, 'refresh must retain unacknowledged edits')
const conflict = (await store.listOperations('alice'))[0]
await store.recordResponse('alice', { operationId: conflict.operationId, outcome: 'conflict', conflict: { entity: 'object', id: 'keep', revision: 2, current: {}, fields: ['title'] } })
await store.replaceSnapshot('alice', snapshot('alice'), [conflict.operationId])
assert.equal((await store.listOperations('alice')).length, 1, 'refresh must retain conflicts')
await store.recordResponse('alice', { operationId: conflict.operationId, outcome: 'duplicate' })
await store.replaceSnapshot('alice', snapshot('alice'), [conflict.operationId])
assert.equal((await store.listOperations('alice')).length, 0)

const order = await Promise.all(Array.from({ length: 8 }, (_, i) => store.saveOperation('alice', mutation(`parallel-${i}`))))
const sequences = (await store.listOperations('alice')).filter((entry) => entry.mutation.type === 'object.create').map((entry) => entry.sequence)
assert.equal(new Set(sequences).size, sequences.length, 'parallel saves must have unique sequence numbers')
assert.equal(Math.max(...sequences) - Math.min(...sequences) + 1, sequences.length, 'parallel saves must be contiguous')
assert.equal(order.length, 8)

// A media write aborts after the outbox request has already succeeded. The
// public promise must reject and IndexedDB must roll back both stores.
const storePrototype = Object.getPrototypeOf((await new Promise((resolve, reject) => {
  const request = indexedDB.open('capsule-archive')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})).transaction('media', 'readwrite').objectStore('media'))
const originalPut = storePrototype.put
let forcedAbort = false
storePrototype.put = function (...args) {
  const request = originalPut.apply(this, args)
  if (this.name === 'media' && !forcedAbort) {
    forcedAbort = true
    request.addEventListener('success', () => this.transaction.abort())
  }
  return request
}
await assert.rejects(store.saveOperation('abort-owner', mutation('abort'), [media('abort-media', 'must roll back')]))
storePrototype.put = originalPut
assert.equal((await store.listOperations('abort-owner')).length, 0, 'aborted transaction must remove outbox insert')
assert.equal(await store.readMedia('abort-owner', 'abort-media'), undefined, 'aborted transaction must remove media')

// A successful request callback is not completion: the operation promise stays
// pending until the transaction's oncomplete fires.
let settled = false
const durable = store.saveOperation('durable-owner', mutation('durable'))
void durable.then(() => { settled = true })
await Promise.resolve()
assert.equal(settled, false, 'save must not resolve on individual request success')
await durable

const db = indexedDB.databases ? (await indexedDB.databases()).find((item) => item.name === 'capsule-archive') : null
assert.ok(db, 'database should exist')
console.log(`offline store verification passed: ${sequences.length} parallel operations, owner isolation, media export, acknowledgements, and conflict retention`)
rmSync(outdir, { recursive: true, force: true })
