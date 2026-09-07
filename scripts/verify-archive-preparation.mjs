import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
const { indexedDB, IDBKeyRange } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _opts, run) => run({}) } }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-archive-prepare-`)
const snapshot = (ownerId, title = 'First', source = 'https://media.test/first.webp') => ({
  version: 1, ownerId, records: [{ id: 'object-1', revision: 1, lotNo: 1, title }],
  faces: [{ id: 'face-1', objectId: 'object-1', revision: 1, originalUrl: 'https://private.test/original.jpg', cutoutUrl: source, thumbUrl: source, role: 'recto' }],
  people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], pendingIntake: [], tombstones: [],
})
// Upgrade an actual v1 database without losing the archive, pending edits, or media.
await new Promise((resolve, reject) => {
  const request = indexedDB.open('capsule-archive', 1)
  request.onupgradeneeded = () => {
    const db = request.result
    db.createObjectStore('archives', { keyPath: 'ownerId' })
    db.createObjectStore('outbox', { keyPath: ['ownerId', 'operationId'] }).createIndex('ownerId', 'ownerId')
    db.createObjectStore('media', { keyPath: ['ownerId', 'id'] }).createIndex('ownerId', 'ownerId')
  }
  request.onsuccess = () => {
    const db = request.result, tx = db.transaction(['archives', 'outbox', 'media'], 'readwrite')
    tx.objectStore('archives').put({ ownerId: 'legacy', snapshot: snapshot('legacy'), preparedAt: null, refreshedAt: 1 })
    tx.objectStore('outbox').put({ ownerId: 'legacy', operationId: 'operation', sequence: 1, mutation: { type: 'object.delete' } })
    tx.objectStore('media').put({ ownerId: 'legacy', id: 'original', bytes: new Blob(['legacy']) })
    tx.oncomplete = () => { db.close(); resolve() }; tx.onabort = () => reject(tx.error)
  }
  request.onerror = () => reject(request.error)
})
for (const name of ['store', 'prepare', 'library']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: `${outdir}/${name}.mjs` })
const store = await import(`${outdir}/store.mjs`), { prepareArchive } = await import(`${outdir}/prepare.mjs`), { searchArchive } = await import(`${outdir}/library.mjs`)
const progress = []
let active = true, downloads = [], serverSnapshot = snapshot('alice'), failSource, wrongSource = false, failStatus = 200
const options = { isActiveOwner: () => active, onProgress: (value) => progress.push(value) }
globalThis.fetch = async (url, init) => {
  assert.equal(init.headers['x-capsule-owner'], 'alice')
  if (url === '/api/sync') return Response.json(serverSnapshot, { status: failStatus })
  const source = new URL(url, 'https://local.test').searchParams.get('source')
  downloads.push(source)
  if (source === failSource) throw new TypeError('disconnected')
  return new Response(new Blob([source], { type: 'image/jpeg' }), { headers: { 'x-capsule-media-source': wrongSource ? 'wrong' : source } })
}
try {
  assert.equal((await store.readArchive('legacy')).snapshot.ownerId, 'legacy')
  assert.equal((await store.listOperations('legacy')).length, 1)
  assert.equal(await (await store.readMedia('legacy', 'original')).bytes.text(), 'legacy')
  assert.equal(await prepareArchive('alice', options), 'ready')
  assert.equal(downloads.length, 2, 'shared cutout/thumb URL downloads once')
  assert.ok((await store.readArchive('alice')).preparedAt)
  assert.equal(await store.readArchive('bob'), undefined)
  assert.equal(await store.readMedia('bob', 'remote:https://private.test/original.jpg'), undefined)
  assert.equal(progress.at(-1).saved, progress.at(-1).total)
  console.log('PASS v1 upgrade, owner partitions, complete archive, and duplicate asset reuse')

  serverSnapshot = snapshot('alice', 'New version', 'https://media.test/new.webp')
  serverSnapshot.faces.push({ id: 'face-2', revision: 1, objectId: 'object-1', role: 'verso', cutoutUrl: 'https://media.test/back.webp' })
  failSource = 'https://media.test/back.webp'
  await assert.rejects(prepareArchive('alice', options), /disconnected/)
  assert.equal((await store.readArchive('alice')).snapshot.records[0].title, 'First', 'interrupted refresh preserves complete snapshot')
  const pending = await store.readPreparation('alice')
  await assert.rejects(store.finishPreparation('alice', pending.id), /missing/)
  await assert.rejects(store.finishPreparation('alice', 'stale'), /replaced/)
  assert.equal((await store.mediaAvailability('alice', pending.snapshot)).saved, 2)
  failSource = undefined; downloads = []
  await prepareArchive('alice', options)
  assert.deepEqual(downloads, ['https://media.test/back.webp'], 'resume reuses successful original and front downloads')
  assert.equal((await store.readArchive('alice')).snapshot.records[0].title, 'New version')
  assert.equal(await store.readPreparation('alice'), undefined)
  console.log('PASS interrupted refresh preserves old archive; resume completes only missing media')

  serverSnapshot = snapshot('other')
  await assert.rejects(prepareArchive('alice', options), /another account/)
  serverSnapshot = snapshot('alice', 'Unconfirmed', 'https://media.test/unconfirmed.webp')
  wrongSource = true
  await assert.rejects(prepareArchive('alice', options), /confirmed/)
  assert.equal((await store.readArchive('alice')).snapshot.records[0].title, 'New version')
  wrongSource = false; failStatus = 401
  assert.equal(await prepareArchive('alice', options), 'locked')
  failStatus = 200; active = false
  downloads = []; assert.equal(await prepareArchive('alice', options), 'locked'); assert.equal(downloads.length, 0)
  active = true
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (...args) => { const response = await originalFetch(...args); if (args[0] !== '/api/sync') active = false; return response }
  assert.equal(await prepareArchive('alice', options), 'locked')
  assert.equal(await store.readMedia('alice', 'remote:https://media.test/unconfirmed.webp'), undefined)
  active = true; globalThis.fetch = originalFetch
  console.log('PASS wrong-owner/source acknowledgments, authentication, and in-flight account changes')

  const db = await new Promise((resolve) => { const request = indexedDB.open('capsule-archive'); request.onsuccess = () => resolve(request.result) })
  const prototype = Object.getPrototypeOf(db.transaction('media', 'readwrite').objectStore('media')), originalPut = prototype.put
  prototype.put = function (...args) { const request = originalPut.apply(this, args); if (this.name === 'media') request.addEventListener('success', () => this.transaction.abort()); return request }
  await assert.rejects(prepareArchive('alice', options))
  prototype.put = originalPut; db.close()
  assert.equal((await store.readArchive('alice')).snapshot.records[0].title, 'New version')
  assert.equal(await store.readMedia('alice', 'remote:https://media.test/unconfirmed.webp'), undefined)
  const controller = new AbortController(); controller.abort()
  assert.equal(await prepareArchive('alice', { ...options, signal: controller.signal }), 'locked')
  console.log('PASS storage abort and cancellation never replace a complete archive')

  const large = snapshot('alice')
  large.records = Array.from({ length: 5001 }, (_, index) => ({ id: `object-${index}`, revision: 1, title: `Object ${index}`, lotNo: index + 1, receivedAt: index === 5000 ? null : '2026-09-06' }))
  large.people = [{ id: 'person', name: 'Ada', revision: 1 }]
  large.objectPeople = [{ objectId: 'object-5000', personId: 'person', role: 'given_by' }]
  assert.equal(searchArchive(large, '').length, 5001)
  assert.equal(searchArchive(large, 'Ada')[0].id, 'object-5000')
  assert.equal(searchArchive(large, '', 'person:person')[0].id, 'object-5000')
  assert.equal(searchArchive(large, 'OBJ-5001')[0].id, 'object-5000')
  assert.equal(searchArchive(large, '', '', 'oldest').at(-1).id, 'object-5000')
  console.log('PASS search/filter includes objects beyond 5000 and preserves unknown dates')
  console.log('verify-archive-preparation: passed')
} finally { rmSync(outdir, { recursive: true, force: true }) }
