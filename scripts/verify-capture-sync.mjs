import assert from 'node:assert/strict'
import { build, buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
const { indexedDB, IDBKeyRange } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
const locks = { request: async (_name, _options, run) => run({}) }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, locks }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-capture-sync-`)
const stubs = {
  '@vercel/blob/client': 'export async function upload(path, bytes) { return globalThis.testUpload(path, bytes) }',
  './heic': 'export async function toUploadable(file) { return globalThis.testConvert(file) }',
}
await build({ entryPoints: ['src/lib/capture-sync.ts'], bundle: true, format: 'esm', outfile: `${outdir}/sync.mjs`, platform: 'node', plugins: [{ name: 'transport', setup(build) {
  build.onResolve({ filter: /^(@vercel\/blob\/client|\.\/heic)$/ }, ({ path }) => ({ path, namespace: 'test' }))
  build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }))
} }] })
buildSync({ entryPoints: ['src/lib/offline-queue.ts'], bundle: true, format: 'esm', outfile: `${outdir}/queue.mjs`, platform: 'node' })
const { drainCaptures } = await import(`${outdir}/sync.mjs`)
const queue = await import(`${outdir}/queue.mjs`)
const file = (text, name = 'image.jpg', type = 'image/jpeg') => new File([text], name, { type })
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })
const progress = []
const options = { isActiveOwner: () => true, onProgress: (value) => progress.push(value) }
let uploads = []
function defaults() {
  uploads = []
  globalThis.testConvert = async (file) => ({ ok: true, file, converted: false })
  globalThis.testUpload = async (path, bytes) => { uploads.push({ path, bytes }); return { url: path } }
}
function server(run) {
  globalThis.fetch = async (url, init) => url === '/api/capture' ? run(JSON.parse(init.body), init) : response({ ok: true })
}
function pending(owner) { return queue.listQueued(owner) }
try {
  defaults()
  await queue.enqueueUpload('network', file('original'))
  server(async () => { throw new TypeError('network failed although onLine is true') })
  await drainCaptures('network', options)
  const [saved] = await pending('network')
  assert.equal(await saved.bytes.text(), 'original')
  assert.equal(uploads.length, 0)
  const stableId = saved.prepared.captureId
  server(async (body) => { assert.equal(body.captureId, stableId); return response({ status: 'recorded', itemId: stableId }) })
  await drainCaptures('network', options)
  assert.equal((await pending('network')).length, 0)

  defaults()
  await queue.enqueueUpload('lost-upload', file('upload bytes'))
  let arrived = false, finishes = 0
  globalThis.testUpload = async (path, bytes) => { uploads.push({ path, bytes }); arrived = true; throw new TypeError('lost Blob response') }
  server(async (body) => {
    if (body.action === 'status') return response({ status: arrived ? 'uploaded' : 'missing' })
    finishes++; return response({ status: 'recorded', itemId: body.captureId })
  })
  await drainCaptures('lost-upload', options)
  assert.equal(uploads.length, 1); assert.equal(finishes, 1)
  assert.equal((await pending('lost-upload')).length, 0)

  defaults()
  await queue.enqueueUpload('lost-finish', file('finish bytes'))
  let recorded = false, firstFinishId
  server(async (body) => {
    if (body.action === 'status') return response(recorded ? { status: 'recorded', itemId: body.captureId } : { status: 'missing' })
    recorded = true; firstFinishId = body.captureId; throw new TypeError('lost finish acknowledgement')
  })
  await drainCaptures('lost-finish', options)
  assert.equal((await pending('lost-finish')).length, 1)
  assert.equal((await pending('lost-finish'))[0].prepared.captureId, firstFinishId)
  await drainCaptures('lost-finish', options)
  assert.equal(uploads.length, 1)
  assert.equal((await pending('lost-finish')).length, 0)

  defaults()
  await queue.enqueueUpload('unconfirmed', file('not confirmed'))
  server(async () => response({ status: 'missing' }))
  await drainCaptures('unconfirmed', options)
  assert.equal((await pending('unconfirmed')).length, 1)

  for (const code of [401, 409]) {
    defaults()
    const owner = `auth-${code}`
    await queue.enqueueUpload(owner, file('auth'))
    server(async () => response({}, code))
    assert.equal(await drainCaptures(owner, options), 'locked')
    assert.equal(uploads.length, 0); assert.equal((await pending(owner)).length, 1)
  }

  defaults()
  await queue.enqueueUpload('changed', file('first'))
  await queue.enqueueUpload('changed', file('second'))
  let active = true, requests = 0
  server(async (body) => { requests++; active = false; return response({ status: 'recorded', itemId: body.captureId }) })
  assert.equal(await drainCaptures('changed', { ...options, isActiveOwner: () => active }), 'locked')
  assert.equal(requests, 1); assert.equal(uploads.length, 0)
  assert.equal((await pending('changed')).length, 2)

  defaults()
  await queue.enqueueUpload('wrong-ack', file('must retain'))
  server(async () => response({ status: 'recorded', itemId: crypto.randomUUID() }))
  await drainCaptures('wrong-ack', options)
  assert.equal((await pending('wrong-ack')).length, 1)
  assert.equal(uploads.length, 0)

  defaults()
  await queue.enqueueUpload('heic', file('untouched HEIC', 'camera.HEIC', 'image/heic'))
  globalThis.testConvert = async () => ({ ok: true, converted: true, file: file('converted JPEG', 'camera.jpg') })
  server(async (body) => response(body.action === 'status' ? { status: 'missing' } : { status: 'recorded', itemId: body.captureId }))
  await drainCaptures('heic', options)
  assert.equal(await uploads[0].bytes.text(), 'converted JPEG')
  assert.equal((await pending('heic')).length, 0)
  assert.equal(await (await queue.listRetainedOriginals('heic'))[0].bytes.text(), 'untouched HEIC')

  defaults()
  for (let i = 0; i < 20; i++) await queue.enqueueUpload('twenty', file(`photo ${i}`))
  const ids = new Set()
  server(async (body) => {
    if (body.action === 'status') return response({ status: 'missing' })
    ids.add(body.captureId); return response({ status: 'recorded', itemId: body.captureId })
  })
  await drainCaptures('twenty', options)
  assert.equal(ids.size, 20); assert.equal(new Set(uploads.map((item) => item.path)).size, 20)
  assert.equal(new Set(await Promise.all(uploads.map((item) => item.bytes.text()))).size, 20)
  assert.equal((await pending('twenty')).length, 0)

  defaults()
  for (const name of ['a photo (1).jpg', `${'long '.repeat(60)}.jpg`]) await queue.enqueueUpload('names', file('named', name))
  server(async (body) => {
    assert.match(body.name, /^[\w.-]+$/); assert.ok(body.name.length <= 200)
    return response(body.action === 'status' ? { status: 'missing' } : { status: 'recorded', itemId: body.captureId })
  })
  await drainCaptures('names', options)
  assert.equal(uploads.length, 2); assert.equal((await pending('names')).length, 0)

  defaults()
  const draft = { title: 'A postcard', kind: 'postcard', receivedAt: '', place: 'Paris', occasion: '', givenBy: 'Friend', tags: ['travel'], story: 'A memory', corners: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }] }
  const draftKey = await queue.enqueueUpload('draft', file('original draft'), undefined, draft)
  let draftRequests = 0, filingRequests = 0, firstDraftBody, loseFilingReply = true
  const objectId = crypto.randomUUID()
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    assert.equal(init.headers['x-capsule-owner'], 'draft')
    if (url === '/api/capture') { draftRequests++; return response({ status: 'recorded', itemId: body.captureId }) }
    assert.equal(url, '/api/capture/file'); filingRequests++
    firstDraftBody ??= init.body
    assert.equal(init.body, firstDraftBody)
    assert.deepEqual(body.draft, draft)
    if (loseFilingReply) throw new TypeError('lost filing acknowledgement')
    return response({ itemId: body.itemId, objectId, lotNo: 17 })
  }
  await drainCaptures('draft', options)
  assert.equal(draftRequests, 0, 'unfinished drafts must not upload')
  await queue.saveCaptureDraft('draft', draftKey, draft, true, 0, new Blob(['corrected preview']))
  await drainCaptures('draft', options)
  assert.equal(filingRequests, 1)
  assert.equal((await pending('draft')).length, 1, 'lost filing response retains source and edits')
  await assert.rejects(queue.saveCaptureDraft('draft', draftKey, { ...draft, title: 'Changed' }, true, 1), /started syncing/)
  loseFilingReply = false
  await drainCaptures('draft', options)
  assert.equal(filingRequests, 2); assert.equal(uploads.length, 0)
  assert.equal((await pending('draft')).length, 0)
  const [filed] = await queue.listRetainedOriginals('draft')
  assert.equal(await filed.bytes.text(), 'original draft'); assert.equal(filed.filed.objectId, objectId)
  assert.equal(await filed.preview.text(), 'corrected preview')

  for (const failure of ['401', '409', '503', 'wrong-item', 'wrong-object', 'wrong-lot', 'account-change']) {
    const owner = `filing-${failure}`
    const key = await queue.enqueueUpload(owner, file('safe original'), undefined, draft)
    await queue.saveCaptureDraft(owner, key, draft, true, 0)
    let isActive = true
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body)
      if (url === '/api/capture') return response({ status: 'recorded', itemId: body.captureId })
      assert.equal(url, '/api/capture/file')
      if (/^\d/.test(failure)) return response({}, Number(failure))
      if (failure === 'account-change') isActive = false
      return response({ itemId: failure === 'wrong-item' ? crypto.randomUUID() : body.itemId, objectId: failure === 'wrong-object' ? 'nope' : objectId, lotNo: failure === 'wrong-lot' ? 0 : 2 })
    }
    await drainCaptures(owner, { ...options, isActiveOwner: () => isActive })
    assert.equal((await pending(owner)).length, 1, `${failure}: keep unconfirmed draft`)
    assert.equal((await queue.listRetainedOriginals(owner)).length, 0)
  }

  await queue.enqueueUpload('no-locks', file('locked'))
  navigator.locks = undefined
  assert.equal(await drainCaptures('no-locks', options), 'locked')
  assert.equal((await pending('no-locks')).length, 1)
  console.log('capture sync verification passed: network/ack failures, stable IDs, account changes, HEIC originals, 20 same-name photos, canonical filenames, and lock safety')
} finally { rmSync(outdir, { recursive: true, force: true }) }
