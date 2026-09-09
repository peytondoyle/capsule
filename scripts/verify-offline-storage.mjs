// OFFLINE_RUNTIME must resolve fake-indexeddb; no database server or Blob token is used.
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME}/package.json`)
Object.assign(globalThis, require('fake-indexeddb'))
const held = new Map()
const locks = { async request(name, options, run) {
  if (held.has(name) && options.ifAvailable) return run(null)
  const previous = held.get(name)
  let release
  const waiting = new Promise(resolve => { release = resolve })
  held.set(name, waiting)
  await previous
  try { return await run({ name }) }
  finally { if (held.get(name) === waiting) held.delete(name); release() }
} }
Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-storage-`)
for (const [source, name] of [['offline/store', 'store'], ['offline-queue', 'queue'], ['offline/media', 'media']]) buildSync({ entryPoints: [`src/lib/${source}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
const store = await import(`${outdir}/store.mjs`), queue = await import(`${outdir}/queue.mjs`), media = await import(`${outdir}/media.mjs`)
const snapshot = (ownerId, sources = []) => ({ version: 1, ownerId, records: [{ id: 'object', revision: 1 }], faces: sources.map((source, i) => ({ id: `face-${i}`, revision: 1, objectId: 'object', originalUrl: source })), pendingIntake: [], people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], tombstones: [] })
const url = name => `https://fixture.test/${name}.webp`
const save = (owner, name, bytes = name) => store.saveArchiveMedia(owner, url(name), new Blob([bytes], { type: 'image/webp' }))
const read = (owner, name) => store.readMedia(owner, media.mediaKey(url(name)))
const reclaim = (owner, active = () => true) => store.reclaimArchiveMedia(owner, active)
const idb = name => new Promise((resolve, reject) => { const req = indexedDB.open(name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
let db
try {
  await store.replaceSnapshot('alice', snapshot('alice', [url('object')]))
  const prep = snapshot('alice', [url('preparation')]); prep.pendingIntake.push({ id: 'intake', maskUrl: url('intake-mask') })
  await store.beginPreparation('alice', prep)
  const op = await store.saveOperation('alice', { type: 'face.upsert', objectId: 'object', values: { originalUrl: url('operation') } }, [{ id: 'local-original', bytes: new Blob(['local camera']), name: 'local.heic', type: 'image/heic', createdAt: 1 }])
  await store.recordResponse('alice', { operationId: op.operationId, outcome: 'conflict', conflict: { entity: 'face', id: 'face', revision: 2, fields: ['originalUrl'], current: { cutoutUrl: url('conflict') } } })
  const face = await queue.enqueueFace('alice', new File(['untouched HEIC'], 'camera.heic', { type: 'image/heic' }), { action: 'save', objectId: 'object', faceId: 'face', operationId: crypto.randomUUID(), role: 'recto', base: { originalUrl: url('draft-base') } }, new Blob(['draft preview']))
  await queue.recordFaceConflict('alice', face.key, face.faceTarget.operationId, { current: { thumbUrl: url('draft-conflict') }, objectDeleted: false })
  const retainedKey = await queue.enqueueUpload('alice', new File(['retained HEIC'], 'retained.heic', { type: 'image/heic' }))
  const captureId = crypto.randomUUID()
  await queue.prepareUpload('alice', retainedKey, { captureId, name: 'retained.jpg', type: 'image/jpeg', bytes: new Blob(['processing JPEG']), converted: true })
  await queue.acknowledgeOriginalBackup('alice', retainedKey, captureId, { size: 13, sha256: 'a'.repeat(64) })
  await queue.acknowledgeUpload('alice', retainedKey, captureId)
  db = await idb('capsule-offline')
  await new Promise((resolve, reject) => { const tx = db.transaction('pending-uploads', 'readwrite'), records = tx.objectStore('pending-uploads'), get = records.get(retainedKey); get.onsuccess = () => records.put({ ...get.result, dismissed: true, faceReceipt: { cutoutUrl: url('retained-receipt') } }); tx.oncomplete = resolve; tx.onabort = reject })
  db.close(); db = undefined
  const names = ['object', 'preparation', 'intake-mask', 'operation', 'conflict', 'draft-base', 'draft-conflict', 'retained-receipt']
  for (const name of [...names, 'unused']) await save('alice', name)
  await save('bob', 'unused', 'foreign bytes')
  const result = await reclaim('alice')
  assert.deepEqual(result, { status: 'reclaimed', removed: 1, bytes: 6, retained: 9 })
  for (const name of names) assert.ok(await read('alice', name), `${name} is referenced`)
  assert.equal(await read('alice', 'unused'), undefined)
  assert.equal(await (await read('bob', 'unused')).bytes.text(), 'foreign bytes')
  assert.equal(await (await store.readMedia('alice', 'local-original')).bytes.text(), 'local camera')
  const [retained] = await queue.listRetainedOriginals('alice')
  assert.equal(await retained.bytes.text(), 'retained HEIC'); assert.equal(await retained.prepared.bytes.text(), 'processing JPEG'); assert.ok(retained.originalBackup)
  assert.equal(await (await queue.listFaceChanges('alice'))[0].preview.text(), 'draft preview')
  assert.equal((await reclaim('alice')).removed, 0)
  console.log('1 live snapshot, preparation/intake, pending/conflict/draft/retained references and all camera bytes survive; only unused owner cache removed')

  await save('alice', 'rollback-a'); await save('alice', 'rollback-b')
  db = await idb('capsule-archive')
  const proto = Object.getPrototypeOf(db.transaction('media', 'readonly').objectStore('media')), originalDelete = proto.delete
  let interrupted = false
  proto.delete = function (...args) { const request = originalDelete.apply(this, args); if (this.name === 'media' && !interrupted) { interrupted = true; request.addEventListener('success', () => this.transaction.abort()) }; return request }
  await assert.rejects(reclaim('alice')); proto.delete = originalDelete
  assert.ok(await read('alice', 'rollback-a')); assert.ok(await read('alice', 'rollback-b'))
  let active = true
  proto.delete = function (...args) { const request = originalDelete.apply(this, args); if (this.name === 'media') request.addEventListener('success', () => { active = false }); return request }
  await assert.rejects(reclaim('alice', () => active), /paused/); proto.delete = originalDelete
  assert.ok(await read('alice', 'rollback-a')); assert.ok(await read('alice', 'rollback-b'))
  db.close(); db = undefined
  console.log('2 transaction abort and account switch roll back all removals')

  const actualLocks = navigator.locks; navigator.locks = undefined
  await assert.rejects(reclaim('alice'), /locking/); navigator.locks = actualLocks
  await assert.rejects(reclaim('missing'), /Prepare/)
  await store.replaceSnapshot('invalid', { ownerId: 'invalid', version: 1 }); await save('invalid', 'unused')
  await assert.rejects(reclaim('invalid'), /Prepare/); assert.ok(await read('invalid', 'unused'))
  let release, entered
  const ready = new Promise(resolve => { entered = resolve })
  const heldLock = navigator.locks.request(media.MEDIA_REFERENCE_LOCK, {}, async () => { entered(); await new Promise(resolve => { release = resolve }) })
  await ready; assert.deepEqual(await reclaim('alice'), { status: 'busy' }); release(); await heldLock
  console.log('3 unsupported locks, missing/invalid archive and busy lock never delete')

  await store.replaceSnapshot('race', snapshot('race'))
  await save('race', 'new-draft')
  const saving = queue.enqueueFace('race', new File(['source'], 'source.jpg'), { action: 'save', objectId: 'object', faceId: 'face', operationId: crypto.randomUUID(), role: 'recto', base: { thumbUrl: url('new-draft') } })
  const competing = await reclaim('race')
  await saving
  assert.equal(competing.status, 'busy'); assert.ok(await read('race', 'new-draft'))
  assert.equal((await reclaim('race')).removed, 0)
  await save('race', 'new-snapshot')
  await Promise.all([store.replaceSnapshot('race', snapshot('race', [url('new-snapshot')])), reclaim('race')])
  assert.ok(await read('race', 'new-snapshot'))
  await save('race', 'new-preparation')
  await Promise.all([store.beginPreparation('race', snapshot('race', [url('new-preparation')])), reclaim('race')])
  assert.ok(await read('race', 'new-preparation'))
  console.log('4 concurrent queue writes, snapshot replacement and preparation preserve their media')

  const refs = media.referencedMediaKeys([{ source: url('url'), localKey: media.mediaKey(url('id')) }])
  assert.ok(refs.has(media.mediaKey(url('url')))); assert.ok(refs.has(media.mediaKey(url('id'))))
  console.log('verify-offline-storage: passed; actual IndexedDB and serialized locks, no external services')
} finally { db?.close(); rmSync(outdir, { recursive: true, force: true }) }
