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
const outdir = mkdtempSync(`${tmpdir()}/capsule-capture-queue-`)
buildSync({ entryPoints: ['src/lib/offline-queue.ts'], bundle: true, format: 'esm', outfile: `${outdir}/queue.mjs`, platform: 'node' })
const queue = await import(`${outdir}/queue.mjs`)
const file = (text, name = 'image.jpg', type = 'image/jpeg') => new File([text], name, { type })
const prepared = (captureId, bytes, converted = false) => ({ captureId, name: 'image.jpg', type: converted ? 'image/jpeg' : 'image/heic', bytes: file(bytes, 'image.jpg', converted ? 'image/jpeg' : 'image/heic'), converted })

const keys = await Promise.all(Array.from({ length: 20 }, (_, i) => queue.enqueueUpload('alice', file(`alice-${i}`))))
assert.equal(new Set(keys).size, 20)
assert.equal((await queue.listQueued('alice')).length, 20)
assert.equal((await queue.listQueued('bob')).length, 0)

const key = keys[0]
const first = await queue.prepareUpload('alice', key, prepared('capture-1', 'converted', true))
const [same, sameConcurrent] = await Promise.all([
  queue.prepareUpload('alice', key, prepared('capture-2', 'wrong')),
  queue.prepareUpload('alice', key, prepared('capture-3', 'wrong')),
])
assert.equal(first.captureId, 'capture-1')
assert.equal(same.captureId, 'capture-1')
assert.equal(sameConcurrent.captureId, 'capture-1')
await assert.rejects(queue.prepareUpload('bob', key, prepared('foreign', 'bad')), /local queue/)

await queue.acknowledgeUpload('alice', key, 'item-jpeg')
assert.equal((await queue.listQueued('alice')).some((item) => item.key === key), false)
assert.equal((await queue.listRetainedOriginals('alice')).some((item) => item.key === key), true)
assert.equal(await (await queue.listRetainedOriginals('alice')).find((item) => item.key === key).bytes.text(), 'alice-0')
await queue.acknowledgeUpload('alice', key, 'item-jpeg-2')
assert.equal((await queue.listRetainedOriginals('alice')).filter((item) => item.key === key).length, 1)

const jpegKey = keys[1]
await queue.prepareUpload('alice', jpegKey, prepared('jpeg-capture', 'jpeg', false))
await queue.acknowledgeUpload('alice', jpegKey, 'item-jpeg')
assert.equal((await queue.listRetainedOriginals('alice')).some((item) => item.key === jpegKey), false)

const rawKey = keys[2]
await queue.prepareUpload('alice', rawKey, prepared('heic-capture', 'raw-heic', true))
await queue.acknowledgeUpload('alice', rawKey, 'item-heic')
const retained = (await queue.listRetainedOriginals('alice')).find((item) => item.key === rawKey)
assert.equal(await retained.bytes.text(), 'alice-2')
assert.equal(retained.prepared.captureId, 'heic-capture')

const legacyKey = await queue.enqueueUpload('alice', file('legacy', 'old-key.jpg'))
await queue.prepareUpload('alice', legacyKey, prepared('legacy-capture', 'prepared'))
assert.equal((await queue.listQueued('alice')).some((item) => item.key === legacyKey), true)

const draft = { title: 'Train ticket', kind: 'ticket_stub', receivedAt: '', place: '', occasion: '', givenBy: '', tags: [], story: 'Kept on the way home', corners: null }
const draftKey = await queue.enqueueUpload('draft-owner', file('raw draft'), undefined, draft)
assert.equal(await queue.claimUpload('draft-owner', draftKey), null)
await assert.rejects(queue.saveCaptureDraft('bob', draftKey, draft, true, 0), /local queue/)
await queue.saveCaptureDraft('draft-owner', draftKey, draft, true, 0, new Blob(['preview']))
await assert.rejects(queue.saveCaptureDraft('draft-owner', draftKey, { ...draft, title: 'Stale' }, false, 0), /another tab/)
const submitted = await queue.claimUpload('draft-owner', draftKey)
assert.equal(submitted.draft.title, draft.title)
await assert.rejects(queue.saveCaptureDraft('draft-owner', draftKey, draft, false, 1), /started syncing/)
await assert.rejects(queue.acknowledgeUpload('draft-owner', draftKey, 'wrong'), /Filing must/)
await queue.prepareUpload('draft-owner', draftKey, prepared('draft-capture', 'raw draft'))
await assert.rejects(queue.acknowledgeFiling('draft-owner', draftKey, { itemId: 'other' }), /did not confirm/)
await queue.acknowledgeFiling('draft-owner', draftKey, { itemId: 'draft-capture', objectId: 'object-1', lotNo: 1 })
assert.equal((await queue.listQueued('draft-owner')).length, 0)
const [filedDraft] = await queue.listRetainedOriginals('draft-owner')
assert.equal(await filedDraft.bytes.text(), 'raw draft')
assert.equal(await filedDraft.preview.text(), 'preview')
assert.equal(filedDraft.draft.story, draft.story)

const racingKey = await queue.enqueueUpload('race', file('race'), undefined, draft)
await queue.saveCaptureDraft('race', racingKey, draft, true, 0)
const race = await Promise.allSettled([
  queue.saveCaptureDraft('race', racingKey, { ...draft, title: 'Newest' }, true, 1),
  queue.claimUpload('race', racingKey),
])
const raced = (await queue.listQueued('race'))[0]
assert.equal(raced.syncStarted, true)
assert.equal(race[0].status === 'fulfilled' ? raced.draft.title : draft.title, race[1].value.draft.title)

const db = await new Promise((resolve, reject) => {
  const request = indexedDB.open('capsule-offline')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const prototype = Object.getPrototypeOf(db.transaction('pending-uploads', 'readwrite').objectStore('pending-uploads'))
const originalAdd = prototype.add
let aborted = false
prototype.add = function (...args) {
  const request = originalAdd.apply(this, args)
  if (!aborted) {
    aborted = true
    request.addEventListener('success', () => this.transaction.abort())
  }
  return request
}
await assert.rejects(queue.enqueueUpload('alice', file('abort'), ''))
prototype.add = originalAdd
assert.equal((await queue.listQueued('alice')).some((item) => item.name === 'image.jpg' && item.bytes.size === 5), false)
db.close()
console.log('capture queue verification passed: 20 unique captures, owner isolation, stable preparation, ack retention, legacy preparation, and abort rollback')
rmSync(outdir, { recursive: true, force: true })
