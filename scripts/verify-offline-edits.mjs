import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
const { indexedDB, IDBKeyRange, IDBObjectStore } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
globalThis.crypto ??= require('node:crypto').webcrypto
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_n, _o, callback) => callback({}) } }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-edits-`)
for (const name of ['store', 'edits', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', outfile: `${outdir}/${name}.mjs`, platform: 'node' })
const store = await import(`${outdir}/store.mjs`)
const { projectArchive, reviewObject } = await import(`${outdir}/edits.mjs`)
const { syncArchive } = await import(`${outdir}/sync.mjs`)
const row = { id: 'object', revision: 1, title: 'Ticket', story: null, kind: 'ticket_stub', receivedAt: null, receivedPrecision: 'unknown', placeId: null, occasionId: null, retention: 'retained', retainedLocation: null, material: null, lotNo: 1 }
const snapshot = (ownerId, records = [structuredClone(row)]) => ({ version: 1, ownerId, records, faces: [], people: [], places: [{id: 'station', name: 'Station', revision: 1}], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], pendingIntake: [], tombstones: [] })
const local = async (owner) => { const { archive, operations } = await store.readLibrary(owner); return projectArchive(archive.snapshot, operations).records[0] }
const review = async (owner) => { const { archive, operations } = await store.readLibrary(owner); return reviewObject(archive, operations, 'object') }
const active = { isActiveOwner: () => true }
const json = (value) => new Response(JSON.stringify(value), { status: 200 })
const originalFetch = globalThis.fetch
try {
  await store.replaceSnapshot('edits', snapshot('edits'))
  const first = await store.saveObjectChanges('edits', 'object', row, { title: 'First title' })
  const second = await store.saveObjectChanges('edits', 'object', await local('edits'), { title: 'Final title', story: 'My memory' })
  assert.notEqual(first.operationId, second.operationId)
  assert.equal(second.mutation.patch.base.title, 'First title')
  assert.equal((await store.listOperations('edits'))[0].mutation.patch.changes.title, 'First title')
  assert.equal((await local('edits')).title, 'Final title', 'saved edits survive database reopening')
  await assert.rejects(store.saveObjectChanges('edits', 'object', row, { title: 'Stale' }), /another tab/)
  await store.saveObjectChanges('edits', 'object', row, { material: 'Paper' })
  for (const changes of [{title:''}, {receivedAt:'2026-02-30'}, {receivedAt:'0000-01-01'}, {retention:'gone'}, {revision:999}, {placeId:'foreign'}, {occasionId:'foreign'}]) await assert.rejects(store.saveObjectChanges('edits', 'object', row, changes))
  assert.equal((await store.listOperations('edits')).length, 3)
  assert.equal(await store.readArchive('other'), undefined)
  await assert.rejects(store.saveObjectChanges('other', 'object', row, {title:'Other'}))
  console.log('PASS durable successive edits, stale-tab protection, independent fields, validation, owner isolation')

  globalThis.fetch = async (_url, init) => json({operationId:JSON.parse(init.body).operationId,outcome:'conflict'})
  await assert.rejects(syncArchive('edits', active), /conflict details are incomplete/)
  assert.equal((await store.listOperations('edits'))[0].response, undefined, 'malformed conflict cannot masquerade as a remote deletion')

  let remote = snapshot('edits'), loseReply = true, failGet = false, malformedGet = false
  const receipts = new Map(), posts = []
  globalThis.fetch = async (_url, init) => {
    if (init?.method !== 'POST') {
      if (failGet) throw new Error('refresh offline')
      return json(malformedGet ? {version:1, ownerId:'edits'} : remote)
    }
    const operation = JSON.parse(init.body), patch = operation.mutation.patch
    posts.push(operation.operationId)
    if (!receipts.has(operation.operationId)) {
      const current = remote.records.find(r => r.id === patch.id)
      const fields = Object.keys(patch.changes).filter(field => JSON.stringify(current?.[field]) !== JSON.stringify(patch.base[field]) && JSON.stringify(current?.[field]) !== JSON.stringify(patch.changes[field]))
      const response = fields.length || !current
        ? {operationId:operation.operationId, outcome:'conflict', conflict:{entity:'object',id:patch.id,revision:current?.revision ?? 99,current:current ? structuredClone(current) : null,fields}}
        : {operationId:operation.operationId,outcome:'applied'}
      if (response.outcome === 'applied') Object.assign(current, patch.changes, {revision:current.revision+1})
      receipts.set(operation.operationId, response)
    }
    if (loseReply) { loseReply = false; throw new Error('lost acknowledgement') }
    return json(receipts.get(operation.operationId))
  }
  await assert.rejects(syncArchive('edits', active), /lost acknowledgement/)
  assert.equal((await local('edits')).title, 'Final title')
  failGet = true
  await assert.rejects(syncArchive('edits', active), /refresh offline/)
  assert.equal(posts[0], posts[1], 'retry reuses operation ID after committed POST loses its reply')
  assert.equal(remote.records[0].title, 'Final title')
  assert.equal((await store.listOperations('edits')).length, 3)
  failGet = false; malformedGet = true
  assert.equal((await syncArchive('edits', active)).status, 'locked')
  assert.equal((await store.listOperations('edits')).length, 3, 'incomplete snapshot never removes acknowledged edits')
  malformedGet = false
  assert.equal((await syncArchive('edits', active)).status, 'synced')
  assert.equal((await store.listOperations('edits')).length, 0)
  assert.equal((await local('edits')).material, 'Paper')
  console.log('PASS lost acknowledgements, immutable retries, ordered server bases, incomplete refresh recovery')

  const baseline = await local('edits')
  await store.saveObjectChanges('edits', 'object', baseline, {title:'My title',story:'My newer memory'})
  await store.saveObjectChanges('edits', 'object', await local('edits'), {story:'My final memory'})
  remote.records[0] = {...remote.records[0], title:'Their title', story:'Their memory', material:'Linen', revision:20}
  assert.equal((await syncArchive('edits', active)).status, 'conflict')
  let currentReview = await review('edits')
  assert.equal(currentReview.local.story, 'My final memory')
  assert.equal(currentReview.remote.title, 'Their title')
  await assert.rejects(store.resolveObjectChanges('edits', 'object', currentReview.token, {title:'local'}), /each field/)
  const before = await store.readLibrary('edits')
  const originalAdd = IDBObjectStore.prototype.add
  IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
  await assert.rejects(store.resolveObjectChanges('edits', 'object', currentReview.token, {title:'remote',story:'local'}))
  IDBObjectStore.prototype.add = originalAdd
  assert.deepEqual(await store.readLibrary('edits'), before, 'aborted resolution restores removed operations and archive together')
  await store.resolveObjectChanges('edits', 'object', currentReview.token, {title:'remote',story:'local'})
  const resolved = (await store.listOperations('edits'))[0]
  assert.equal((await store.listOperations('edits')).length, 1)
  assert.ok(!currentReview.edits.some(edit => edit.operationId === resolved.operationId))
  assert.deepEqual(resolved.mutation.patch.changes, {story:'My final memory'})
  assert.deepEqual(resolved.mutation.patch.base, {story:'Their memory'})
  assert.equal((await local('edits')).title, 'Their title')
  assert.equal((await local('edits')).material, 'Linen')
  await assert.rejects(store.resolveObjectChanges('edits', 'object', currentReview.token, {title:'local',story:'local'}), /another tab/)
  await syncArchive('edits', active)
  assert.equal(remote.records[0].story, 'My final memory')
  assert.equal(remote.records[0].title, 'Their title')
  console.log('PASS conflict choices, final local values, unrelated remote values, atomic rollback, stale review rejection')

  await store.saveObjectChanges('edits', 'object', await local('edits'), {story:'Do not lose this memory'})
  remote.records = []
  assert.equal((await syncArchive('edits', active)).status, 'conflict')
  currentReview = await review('edits')
  assert.equal(currentReview.remote, null)
  assert.equal(currentReview.local.story, 'Do not lose this memory')
  assert.equal((await local('edits')).story, 'Do not lose this memory')
  await assert.rejects(store.resolveObjectChanges('edits', 'object', currentReview.token, {story:'local'}), /Save a copy/)
  await store.resolveObjectChanges('edits', 'object', currentReview.token, {}, true)
  assert.equal((await store.listOperations('edits')).length, 0)
  assert.equal(await local('edits'), undefined, 'discard never recreates a remotely deleted object')
  console.log('PASS remote deletion preserves local recovery until explicit discard')

  const prep = await store.beginPreparation('ready', snapshot('ready'))
  await store.finishPreparation('ready', prep.id)
  await store.replaceSnapshot('ready', snapshot('ready', [{...row,title:'New metadata'}]))
  assert.ok((await store.readArchive('ready')).preparedAt, 'metadata refresh retains preparation readiness')
  IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
  await assert.rejects(store.saveObjectChanges('ready','object',await local('ready'),{title:'Interrupted'}))
  IDBObjectStore.prototype.add = originalAdd
  assert.equal((await store.listOperations('ready')).length,0)
  assert.equal((await local('ready')).title,'New metadata')
  console.log('PASS prepared archive survives metadata refresh; interrupted saves retain previous details')
} finally { globalThis.fetch = originalFetch; rmSync(outdir, {recursive:true,force:true}) }
