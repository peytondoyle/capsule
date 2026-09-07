import assert from 'node:assert/strict'
import { build, buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const runtime = process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'
const require = createRequire(`${runtime}/package.json`), { indexedDB, IDBKeyRange } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const dir = mkdtempSync(`${tmpdir()}/capsule-capture-review-`)
await build({ entryPoints: ['src/lib/capture-sync.ts'], bundle: true, format: 'esm', outfile: `${dir}/sync.mjs`, platform: 'node', plugins: [{ name: 'stubs', setup(build) {
  build.onResolve({ filter: /^@vercel\/blob\/client$/ }, () => ({ path: 'blob', namespace: 'stub' }))
  build.onResolve({ filter: /^\.\/heic$/ }, () => ({ path: 'heic', namespace: 'stub' }))
  build.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: path === 'blob' ? 'export async function upload() { return { url: "uploaded" } }' : 'export async function toUploadable(file) { return { ok: true, converted: false, file } }', loader: 'js' }))
} }] })
buildSync({ entryPoints: ['src/lib/offline-queue.ts'], bundle: true, format: 'esm', outfile: `${dir}/queue.mjs`, platform: 'node' })
const queue = await import(`${dir}/queue.mjs`), { drainCaptures } = await import(`${dir}/sync.mjs`)
const draft = { title: 'A keepsake', kind: 'card', receivedAt: '', place: '', occasion: '', givenBy: '', tags: [], story: 'A story', corners: null }
const file = new File(['camera bytes'], 'same-name.jpg', { type: 'image/jpeg' })
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let conflict = true, requests = []
globalThis.testConvert = async source => ({ ok: true, converted: false, file: source })
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body); requests.push({ url, body })
  if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId })
  if (url === '/api/capture/file' && conflict) { conflict = false; return response({ error: 'capture conflict' }, 409) }
  if (url === '/api/capture/file') return response({ itemId: body.itemId, objectId: crypto.randomUUID(), lotNo: 7 })
  throw new Error(`unexpected ${url}`)
}
const owner = 'review-owner', itemKey = await queue.enqueueUpload(owner, file, undefined, draft)
await queue.saveCaptureDraft(owner, itemKey, draft, true, 0, new Blob(['cropped preview']))
await drainCaptures(owner, { isActiveOwner: () => true, onProgress: () => {} })
let item = (await queue.listQueued(owner))[0]
assert.equal(item.captureConflict.itemId, item.prepared.captureId)
assert.equal(item.syncStarted, false)
assert.equal(await item.bytes.text(), 'camera bytes')
assert.equal(await queue.claimUpload(owner, item.key), null)
await assert.rejects(queue.saveCaptureDraft(owner, item.key, draft, true, item.draftRevision), /started syncing/)
const requestCount = requests.length
await drainCaptures(owner, { isActiveOwner: () => true, onProgress: () => {} })
assert.equal(requests.length, requestCount)
const conflictRevision = item.draftRevision
await assert.rejects(queue.dismissCaptureConflict('other-owner', item.key, conflictRevision), /review/)
await assert.rejects(queue.dismissCaptureConflict(owner, item.key, conflictRevision + 1), /review/)
console.log('PASS durable conflict, retained original, and no blind retry')

const retry = await queue.retryCaptureConflict(owner, item.key, conflictRevision)
item = (await queue.listQueued(owner)).find(saved => saved.key === itemKey)
assert.equal(item.dismissed, true); assert.equal(retry.captureConflict, undefined); assert.equal(retry.prepared, undefined); assert.equal(retry.readyToFile, false); assert.notEqual(retry.key, itemKey); assert.equal(await retry.bytes.text(), 'camera bytes')
assert.equal(await retry.preview?.text(), 'cropped preview')
const beforeReady = requests.length
await drainCaptures(owner, { isActiveOwner: () => true, onProgress: () => {} })
assert.equal(requests.length, beforeReady)
await assert.rejects(queue.retryCaptureConflict(owner, itemKey, conflictRevision), /review/)
await queue.saveCaptureDraft(owner, retry.key, draft, true, 0)
await drainCaptures(owner, { isActiveOwner: () => true, onProgress: () => {} })
const retried = (await queue.listRetainedOriginals(owner)).find(saved => saved.key === retry.key)
assert.equal(retried.filed?.objectId !== undefined, true); assert.notEqual(retried.filed.itemId, item.captureConflict.itemId)
console.log('PASS explicit new-object retry uses fresh local identity and preserves conflict copy')

const dismissOwner = 'dismiss-review', dismissKey = await queue.enqueueUpload(dismissOwner, file, undefined, draft)
await queue.saveCaptureDraft(dismissOwner, dismissKey, draft, true, 0, new Blob(['dismiss preview']))
conflict = true
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId }); if (url === '/api/capture/file') return response({ error: 'capture conflict' }, 409); throw new Error('unexpected') }
await drainCaptures(dismissOwner, { isActiveOwner: () => true, onProgress: () => {} })
const dismiss = (await queue.listQueued(dismissOwner))[0]
await queue.dismissCaptureConflict(dismissOwner, dismiss.key, dismiss.draftRevision)
const dismissed = (await queue.listQueued(dismissOwner))[0]
assert.equal(dismissed.dismissed, true); assert.equal(await dismissed.bytes.text(), 'camera bytes'); assert.equal(await dismissed.preview.text(), 'dismiss preview'); assert.deepEqual(dismissed.draft, draft); assert.equal(await queue.claimUpload(dismissOwner, dismissed.key), null)
console.log('PASS explicit dismissal retains recoverable capture data')

const malformedOwner = 'malformed-409', malformedKey = await queue.enqueueUpload(malformedOwner, file, undefined, draft)
await queue.saveCaptureDraft(malformedOwner, malformedKey, draft, true, 0)
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId }); if (url === '/api/capture/file') return new Response('owner mismatch', { status: 409 }); throw new Error('unexpected') }
await drainCaptures(malformedOwner, { isActiveOwner: () => true, onProgress: () => {} })
const malformed = (await queue.listQueued(malformedOwner))[0]
assert.equal(malformed.captureConflict, undefined); assert.equal(malformed.syncStarted, true)
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId }); if (url === '/api/capture/file') return response({ error: 'owner mismatch' }, 409); throw new Error('unexpected') }
const jsonMismatchOwner = 'json-mismatch', jsonMismatchKey = await queue.enqueueUpload(jsonMismatchOwner, file, undefined, draft)
await queue.saveCaptureDraft(jsonMismatchOwner, jsonMismatchKey, draft, true, 0)
assert.equal(await drainCaptures(jsonMismatchOwner, { isActiveOwner: () => true, onProgress: () => {} }), 'locked')
const lockedOwner = 'changed-owner', lockedKey = await queue.enqueueUpload(lockedOwner, file, undefined, draft)
await queue.saveCaptureDraft(lockedOwner, lockedKey, draft, true, 0)
let lockedRequests = 0; globalThis.fetch = async () => { lockedRequests++; throw new Error('must not send') }
await drainCaptures(lockedOwner, { isActiveOwner: () => false, onProgress: () => {} })
assert.equal(lockedRequests, 0)
console.log('PASS malformed owner response and active-owner lock')

const guardedOwner = 'guarded-review', guardedKey = await queue.enqueueUpload(guardedOwner, file, undefined, draft)
await queue.saveCaptureDraft(guardedOwner, guardedKey, draft, true, 0)
await queue.prepareUpload(guardedOwner, guardedKey, { captureId: crypto.randomUUID(), name: file.name, type: file.type, bytes: file, converted: false })
await queue.claimUpload(guardedOwner, guardedKey)
await assert.rejects(queue.recordCaptureConflict(guardedOwner, guardedKey, crypto.randomUUID(), draft), /active/)
const faceKey = (await queue.enqueueFace(guardedOwner, file, { operationId: crypto.randomUUID(), objectId: crypto.randomUUID(), faceId: crypto.randomUUID(), role: 'recto', action: 'save', base: null })).key
await queue.saveCaptureDraft(guardedOwner, faceKey, draft, true, 0)
await queue.prepareUpload(guardedOwner, faceKey, { captureId: crypto.randomUUID(), name: file.name, type: file.type, bytes: file, converted: false })
await queue.claimUpload(guardedOwner, faceKey)
const faceStored = (await queue.listQueued(guardedOwner)).find(saved => saved.key === faceKey)
await assert.rejects(queue.recordCaptureConflict(guardedOwner, faceKey, faceStored.prepared.captureId, draft), /active/)
console.log('PASS conflict identity and face-queue guards')

const midflightOwner = 'midflight-review', midflightKey = await queue.enqueueUpload(midflightOwner, file, undefined, draft)
await queue.saveCaptureDraft(midflightOwner, midflightKey, draft, true, 0)
let active = true
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId }); if (url === '/api/capture/file') return { status: 409, json: async () => { active = false; return { error: 'capture conflict' } } }; throw new Error('unexpected') }
assert.equal(await drainCaptures(midflightOwner, { isActiveOwner: () => active, onProgress: () => {} }), 'locked')
assert.equal((await queue.listQueued(midflightOwner))[0].captureConflict, undefined)
console.log('PASS mid-flight account change does not persist conflict state')

const lostOwner = 'lost-review', lostKey = await queue.enqueueUpload(lostOwner, file, undefined, draft)
await queue.saveCaptureDraft(lostOwner, lostKey, draft, true, 0)
let lostFileBodies = [], lostReceipt
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId }); if (url === '/api/capture/file') { lostFileBodies.push(body); if (!lostReceipt) { lostReceipt = { itemId: body.itemId, objectId: crypto.randomUUID(), lotNo: 8 }; throw new Error('acknowledgement lost') } return response(lostReceipt) } throw new Error('unexpected') }
await drainCaptures(lostOwner, { isActiveOwner: () => true, onProgress: () => {} })
const lost = (await queue.listQueued(lostOwner))[0]
assert.equal(lost.syncStarted, true); assert.equal(lost.captureConflict, undefined); assert.equal(await lost.bytes.text(), 'camera bytes')
await drainCaptures(lostOwner, { isActiveOwner: () => true, onProgress: () => {} })
assert.equal((await queue.listRetainedOriginals(lostOwner))[0].filed.objectId !== undefined, true)
assert.equal(lostFileBodies.length, 2); assert.deepEqual(lostFileBodies[0], lostFileBodies[1]); assert.equal((await queue.listRetainedOriginals(lostOwner))[0].filed.objectId, lostReceipt.objectId)
console.log('PASS lost filing acknowledgement retains submitted payload and original')
console.log('verify-capture-review: passed')
