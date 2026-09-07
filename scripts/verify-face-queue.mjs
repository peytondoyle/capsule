import assert from 'node:assert/strict'
import { build, buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
const { indexedDB, IDBKeyRange } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-face-queue-`)
const stubs = {
  '@vercel/blob/client': 'export async function upload(path, bytes) { return globalThis.testUpload(path, bytes) }',
  './heic': 'export async function toUploadable(file) { return globalThis.testConvert(file) }',
}
await build({ entryPoints: ['src/lib/capture-sync.ts'], bundle: true, format: 'esm', outfile: `${outdir}/sync.mjs`, platform: 'node', plugins: [{ name: 'transport', setup(build) {
  build.onResolve({ filter: /^(@vercel\/blob\/client|\.\/heic)$/ }, ({ path }) => ({ path, namespace: 'test' }))
  build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }))
} }] })
for (const [source, output] of [['offline-queue', 'queue'], ['face-draft', 'face']]) {
  buildSync({ entryPoints: [`src/lib/${source}.ts`], bundle: true, format: 'esm', outfile: `${outdir}/${output}.mjs`, platform: 'node' })
}
const queue = await import(`${outdir}/queue.mjs`)
const { faceBaseline } = await import(`${outdir}/face.mjs`)
const { drainCaptures } = await import(`${outdir}/sync.mjs`)
const file = (text = 'untouched camera bytes') => new File([text], 'photo.heic', { type: 'image/heic' })
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })
const target = (patch = {}) => ({ operationId: crypto.randomUUID(), objectId: crypto.randomUUID(), faceId: crypto.randomUUID(), role: 'recto', action: 'save', base: null, ...patch })
const draft = { title: '', kind: '', receivedAt: '', place: '', occasion: '', givenBy: '', tags: [], story: '', corners: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }] }
const token = (item) => JSON.stringify({ target: item.faceTarget, conflict: item.faceConflict })
const pending = async (owner, key) => (await queue.listQueued(owner)).find(item => item.key === key)
const options = { kind: 'faces', isActiveOwner: () => true, onProgress: () => {} }
const drain = (owner, patch = {}) => drainCaptures(owner, { ...options, ...patch })
const receipt = (body) => ({ operationId: body.target.operationId, objectId: body.target.objectId, faceId: body.target.faceId, itemId: body.itemId, deleted: body.target.action === 'delete', originalUrl: 'https://original/photo', cutoutUrl: 'https://media/cutout', thumbUrl: 'https://media/thumb', width: 400, height: 300 })
let uploads, requests, progress
function server(owner, faceResponse = (body) => response(receipt(body))) {
  uploads = []; requests = []; progress = []
  options.onProgress = value => progress.push(value)
  globalThis.testConvert = async () => ({ ok: true, converted: true, file: new File(['converted JPEG'], 'photo.jpg', { type: 'image/jpeg' }) })
  globalThis.testUpload = async (path, bytes) => { uploads.push({ path, bytes }); return { url: path } }
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers['x-capsule-owner'], owner)
    const body = JSON.parse(init.body)
    requests.push({ url, body, raw: init.body })
    if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId })
    assert.equal(url, '/api/capture/face')
    return faceResponse(body)
  }
}
async function ready(owner, faceTarget = target()) {
  const item = await queue.enqueueFace(owner, file(), faceTarget, new Blob(['preview']))
  if (faceTarget.action === 'save') await queue.saveCaptureDraft(owner, item.key, draft, true, 0, new Blob(['cropped preview']))
  return item
}
let checks = 0
async function check(name, run) { await run(); checks++; console.log(`✓ ${name}`) }

try {
  await check('raw bytes and preview survive reload; duplicate targets are blocked atomically', async () => {
    const owner = 'duplicates', faceTarget = target()
    const attempts = await Promise.allSettled([queue.enqueueFace(owner, file(), faceTarget), queue.enqueueFace(owner, file(), target({ ...faceTarget, operationId: crypto.randomUUID(), faceId: crypto.randomUUID() }))])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(attempts.filter(result => result.status === 'rejected').length, 1)
    const [saved] = await queue.listFaceChanges(owner)
    assert.equal(await saved.bytes.text(), 'untouched camera bytes')
    assert.equal((await queue.listFaceChanges('another-owner')).length, 0)
    await assert.rejects(queue.enqueueFace(owner, file(), target({ ...faceTarget, faceId: saved.faceTarget.faceId, role: 'detail' })), /saved photo change/)
    await queue.enqueueFace(owner, file(), target({ objectId: faceTarget.objectId, role: 'detail' }))
    await queue.enqueueFace(owner, file(), target({ objectId: faceTarget.objectId, role: 'detail' }))
    assert.equal((await queue.listFaceChanges(owner)).length, 3)
  })

  await check('unfinished drafts do not sync; revisions reject stale edits and freeze after claim', async () => {
    const owner = 'drafts', item = await queue.enqueueFace(owner, file(), target())
    server(owner)
    await drain(owner)
    assert.equal(requests.length, 0)
    await assert.rejects(queue.saveCaptureDraft('another-owner', item.key, draft, true, 0), /local queue/)
    await queue.saveCaptureDraft(owner, item.key, draft, true, 0, new Blob(['crop']))
    await assert.rejects(queue.saveCaptureDraft(owner, item.key, draft, true, 0), /another tab/)
    await assert.rejects(queue.dismissFaceDraft(owner, item.key, 0), /changed/)
    await queue.claimUpload(owner, item.key)
    await assert.rejects(queue.saveCaptureDraft(owner, item.key, draft, true, 1), /started syncing/)
    await assert.rejects(queue.dismissFaceDraft(owner, item.key, 1), /started syncing/)
    assert.equal(await (await pending(owner, item.key)).preview.text(), 'crop')
  })

  await check('dismissal hides the draft and retains bytes without allowing stale edits or upload', async () => {
    const owner = 'dismiss', item = await queue.enqueueFace(owner, file(), target())
    await queue.dismissFaceDraft(owner, item.key, 0)
    assert.equal((await queue.listFaceChanges(owner)).length, 0)
    assert.equal(await (await pending(owner, item.key)).bytes.text(), 'untouched camera bytes')
    await assert.rejects(queue.saveCaptureDraft(owner, item.key, draft, true, 0))
    assert.equal(await queue.claimUpload(owner, item.key), null)
    server(owner); await drain(owner)
    assert.equal(requests.length, 0)
  })

  await check('conflict retains original and crop; review rebases once with a fresh operation ID', async () => {
    const owner = 'conflict', item = await ready(owner)
    const current = { id: crypto.randomUUID(), objectId: item.faceTarget.objectId, role: 'recto', originalUrl: 'new-original', cutoutUrl: 'new-cutout', thumbUrl: 'new-thumb', width: 700, height: 500, sortOrder: 2, extra: 'not baseline' }
    server(owner, () => response({ conflict: { current, objectDeleted: false } }, 409))
    await drain(owner)
    const saved = await pending(owner, item.key), review = token(saved), stableCaptureId = saved.prepared.captureId
    assert.deepEqual(saved.faceConflict.current, current)
    assert.equal(await saved.bytes.text(), 'untouched camera bytes')
    assert.equal(await saved.preview.text(), 'cropped preview')
    assert.equal(await queue.claimUpload(owner, item.key), null)
    await assert.rejects(queue.resolveFaceConflict('another-owner', item.key, review, true), /another tab/)
    await assert.rejects(queue.resolveFaceConflict(owner, item.key, `${review}stale`, true), /another tab/)
    await queue.resolveFaceConflict(owner, item.key, review, true)
    const rebased = await pending(owner, item.key)
    assert.notEqual(rebased.faceTarget.operationId, item.faceTarget.operationId)
    assert.equal(rebased.faceTarget.faceId, current.id)
    assert.deepEqual(rebased.faceTarget.base, faceBaseline(current))
    assert.equal(rebased.faceTarget.base.extra, undefined)
    assert.equal(rebased.prepared.captureId, stableCaptureId)
    assert.equal(rebased.syncStarted, false)
    assert.equal(rebased.faceConflict, undefined)
    assert.deepEqual(rebased.draft.corners, draft.corners)
    await assert.rejects(queue.resolveFaceConflict(owner, item.key, review, true), /another tab/)
    await assert.rejects(queue.recordFaceConflict(owner, item.key, item.faceTarget.operationId, { current, objectDeleted: false }), /no longer active/)
    server(owner); await drain(owner)
    assert.equal((await queue.listQueued(owner)).length, 0)
    const [retained] = await queue.listRetainedOriginals(owner)
    assert.equal(retained.faceReceipt.operationId, rebased.faceTarget.operationId)
    assert.equal(await retained.bytes.text(), 'untouched camera bytes')
  })

  await check('a source conflict requires review, then retries original bytes and crop with fresh capture and operation IDs', async () => {
    const owner = 'source-conflict', item = await ready(owner)
    const current = { id: item.faceTarget.faceId, objectId: item.faceTarget.objectId, role: 'recto', originalUrl: 'archive-original', cutoutUrl: 'archive-cutout', thumbUrl: 'archive-thumb', width: 400, height: 300 }
    server(owner, () => response({ conflict: { current, objectDeleted: false, sourceChanged: true } }, 409))
    await drain(owner)
    const saved = await pending(owner, item.key), oldCaptureId = saved.prepared.captureId
    assert.equal(saved.faceConflict.sourceChanged, true)
    assert.equal(await queue.claimUpload(owner, item.key), null)
    await queue.resolveFaceConflict(owner, item.key, token(saved), true)
    const rebased = await pending(owner, item.key)
    assert.equal(rebased.prepared, undefined)
    assert.notEqual(rebased.faceTarget.operationId, item.faceTarget.operationId)
    assert.deepEqual(rebased.faceTarget.base, faceBaseline(current))
    assert.equal(await rebased.bytes.text(), 'untouched camera bytes')
    assert.equal(await rebased.preview.text(), 'cropped preview')
    assert.deepEqual(rebased.draft.corners, draft.corners)
    server(owner)
    let newCaptureId, acknowledged
    globalThis.testConvert = async source => {
      assert.equal(await source.text(), 'untouched camera bytes')
      return { ok: true, converted: true, file: new File(['converted JPEG'], 'photo.jpg', { type: 'image/jpeg' }) }
    }
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers['x-capsule-owner'], owner)
      const body = JSON.parse(init.body)
      if (url === '/api/capture') {
        newCaptureId ??= body.captureId
        assert.notEqual(body.captureId, oldCaptureId)
        assert.equal(body.captureId, newCaptureId)
        return response(body.action === 'status' ? { status: 'missing' } : { status: 'recorded', itemId: body.captureId })
      }
      assert.equal(url, '/api/capture/face')
      assert.equal(body.itemId, newCaptureId)
      assert.deepEqual(body.target, rebased.faceTarget)
      assert.deepEqual(body.corners, draft.corners)
      acknowledged = receipt(body)
      return response(acknowledged)
    }
    await drain(owner)
    assert.equal(uploads.length, 1)
    assert.equal(await uploads[0].bytes.text(), 'converted JPEG')
    assert.equal((await queue.listQueued(owner)).length, 0)
    const [retained] = await queue.listRetainedOriginals(owner)
    assert.equal(retained.prepared.captureId, newCaptureId)
    assert.deepEqual(retained.faceReceipt, acknowledged)
    assert.equal(await retained.bytes.text(), 'untouched camera bytes')
    assert.deepEqual(retained.draft.corners, draft.corners)
  })

  await check('malformed source conflict flags leave the queue unacknowledged and unreviewed', async () => {
    for (const sourceChanged of ['true', 1, null, {}]) {
      const owner = `malformed-source-${JSON.stringify(sourceChanged)}`, item = await ready(owner)
      server(owner, () => response({ conflict: { current: null, objectDeleted: false, sourceChanged } }, 409))
      assert.equal(await drain(owner), 'locked')
      const saved = await pending(owner, item.key)
      assert.equal(saved.faceConflict, undefined)
      assert.equal(saved.faceReceipt, undefined)
      assert.equal(await saved.bytes.text(), 'untouched camera bytes')
      assert.deepEqual(saved.draft.corners, draft.corners)
      assert.equal((await queue.listRetainedOriginals(owner)).length, 0)
      assert.equal(progress.some(value => value.status === 'uploaded'), false)
    }
  })

  await check('discarding a conflict retains bytes; deleted objects cannot be restored by stale review', async () => {
    for (const deleted of [false, true]) {
      const owner = `discard-${deleted}`, item = await ready(owner)
      server(owner, () => response({ conflict: { current: null, objectDeleted: deleted } }, 409))
      await drain(owner)
      const saved = await pending(owner, item.key), review = token(saved)
      if (deleted) await assert.rejects(queue.resolveFaceConflict(owner, item.key, review, true), /object was deleted/)
      await queue.resolveFaceConflict(owner, item.key, review, false)
      assert.equal((await queue.listFaceChanges(owner)).length, 0)
      assert.equal(await (await pending(owner, item.key)).bytes.text(), 'untouched camera bytes')
      assert.equal(await queue.claimUpload(owner, item.key), null)
      await assert.rejects(queue.resolveFaceConflict(owner, item.key, review, false), /another tab/)
      if (!deleted) await assert.rejects(queue.resolveFaceConflict(owner, item.key, review, true), /another tab/)
    }
    const owner = 'missing-face', item = await ready(owner)
    server(owner, () => response({ conflict: { current: null, objectDeleted: false } }, 409))
    await drain(owner)
    const saved = await pending(owner, item.key)
    await queue.resolveFaceConflict(owner, item.key, token(saved), true)
    const rebased = await pending(owner, item.key)
    assert.notEqual(rebased.faceTarget.faceId, item.faceTarget.faceId)
    assert.notEqual(rebased.faceTarget.operationId, item.faceTarget.operationId)
    assert.equal(rebased.faceTarget.base, null)
  })

  await check('lost face acknowledgement retries the exact operation, pixels and crop', async () => {
    const owner = 'lost-response', item = await ready(owner)
    let lost = true, firstRequest
    server(owner, body => {
      firstRequest ??= JSON.stringify(body)
      assert.equal(JSON.stringify(body), firstRequest)
      assert.deepEqual(body.corners, draft.corners)
      if (lost) throw new TypeError('lost acknowledgement')
      return response(receipt(body))
    })
    await drain(owner)
    assert.ok(await pending(owner, item.key))
    await assert.rejects(queue.saveCaptureDraft(owner, item.key, { ...draft, corners: null }, true, 1), /started syncing/)
    lost = false; await drain(owner)
    assert.equal(requests.filter(request => request.url === '/api/capture/face').length, 2)
    assert.equal(uploads.length, 0)
    assert.equal((await queue.listQueued(owner)).length, 0)
    const [retained] = await queue.listRetainedOriginals(owner)
    assert.equal(await retained.bytes.text(), 'untouched camera bytes')
    assert.equal(await retained.prepared.bytes.text(), 'converted JPEG')
    assert.equal(retained.faceReceipt.operationId, item.faceTarget.operationId)
  })

  await check('a new face uploads prepared bytes and retains its untouched original after confirmation', async () => {
    const owner = 'fresh-upload', item = await ready(owner)
    server(owner)
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers['x-capsule-owner'], owner)
      const body = JSON.parse(init.body)
      requests.push({ url, body })
      if (url === '/api/capture') return response(body.action === 'status' ? { status: 'missing' } : { status: 'recorded', itemId: body.captureId })
      assert.equal(url, '/api/capture/face')
      assert.equal(body.target.operationId, item.faceTarget.operationId)
      assert.deepEqual(body.corners, draft.corners)
      return response(receipt(body))
    }
    await drain(owner)
    assert.equal(uploads.length, 1)
    assert.equal(await uploads[0].bytes.text(), 'converted JPEG')
    const [retained] = await queue.listRetainedOriginals(owner)
    assert.equal(await retained.bytes.text(), 'untouched camera bytes')
    assert.equal(retained.faceReceipt.itemId, retained.prepared.captureId)
    assert.equal(progress.filter(value => value.status === 'uploaded').length, 1)
  })

  await check('only exact and complete receipts acknowledge face changes', async () => {
    const invalid = {
      operationId: crypto.randomUUID(), objectId: crypto.randomUUID(), faceId: crypto.randomUUID(), itemId: crypto.randomUUID(), deleted: true,
      originalUrl: '', cutoutUrl: '', thumbUrl: '', width: 0, height: -1,
    }
    for (const [field, value] of Object.entries(invalid)) {
      const owner = `receipt-${field}`, item = await ready(owner)
      server(owner, body => response({ ...receipt(body), [field]: value }))
      await drain(owner)
      assert.ok(await pending(owner, item.key), `${field} mismatch must retain source`)
      assert.equal((await queue.listRetainedOriginals(owner)).length, 0)
      assert.equal(progress.some(value => value.status === 'uploaded'), false)
    }
  })

  await check('delete operations skip image conversion/upload and require a delete receipt', async () => {
    const owner = 'delete', item = await ready(owner, target({ action: 'delete', role: 'detail' }))
    server(owner)
    globalThis.testConvert = async () => { throw new Error('delete must not convert') }
    await drain(owner)
    assert.equal(uploads.length, 0)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/capture/face')
    assert.equal(requests[0].body.itemId, undefined)
    const [retained] = await queue.listRetainedOriginals(owner)
    assert.equal(retained.faceReceipt.deleted, true)
    assert.equal(retained.itemId, item.faceTarget.operationId)
    const badOwner = 'delete-wrong-receipt', bad = await ready(badOwner, target({ action: 'delete' }))
    server(badOwner, body => response({ ...receipt(body), deleted: false }))
    await drain(badOwner)
    assert.ok(await pending(badOwner, bad.key))
  })

  await check('account changes during face response or JSON parsing cannot acknowledge or store conflicts', async () => {
    for (const action of ['save', 'delete']) for (const phase of ['response', 'json']) for (const conflict of [false, true]) {
      const owner = `account-${action}-${phase}-${conflict}`, item = await ready(owner, target({ action }))
      let active = true
      server(owner, body => {
        const value = conflict ? { conflict: { objectDeleted: false, current: null } } : receipt(body)
        if (phase === 'response') active = false
        return { ok: !conflict, status: conflict ? 409 : 200, json: async () => { if (phase === 'json') active = false; return value } }
      })
      assert.equal(await drain(owner, { isActiveOwner: () => active }), 'locked')
      const saved = await pending(owner, item.key)
      assert.ok(saved)
      assert.equal(saved.faceReceipt, undefined)
      assert.equal(saved.faceConflict, undefined)
      assert.equal(progress.some(value => value.status === 'uploaded'), false)
    }
  })

  await check('ordinary capture drain excludes face changes; face drain excludes ordinary captures', async () => {
    const owner = 'separate', item = await ready(owner)
    server(owner)
    await drainCaptures(owner, { ...options, kind: 'captures' })
    assert.equal(requests.length, 0)
    assert.equal((await pending(owner, item.key)).syncStarted, undefined)
    await queue.enqueueUpload(owner, file('ordinary photo'))
    await drain(owner)
    const remaining = await queue.listQueued(owner)
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].faceTarget, undefined)
    assert.equal(await remaining[0].bytes.text(), 'ordinary photo')
  })
  console.log(`face queue verification passed: ${checks} scenarios; actual IndexedDB queue and capture drain, no external services`)
} finally { rmSync(outdir, { recursive: true, force: true }) }
