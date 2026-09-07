import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME}/package.json`)
const { indexedDB, IDBKeyRange, IDBObjectStore } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const out = mkdtempSync(`${tmpdir()}/taxonomy-delete-`)
for (const file of ['store', 'taxonomy-delete', 'taxonomy', 'edits', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${file}.ts`], bundle: true, format: 'esm', outfile: `${out}/${file}.mjs`, platform: 'node' })
const store = await import(`${out}/store.mjs`)
const { taxonomyDeletionBase, reviewTaxonomyDeletion } = await import(`${out}/taxonomy-delete.mjs`)
const { taxonomyKind } = await import(`${out}/taxonomy.mjs`)
const { projectArchive } = await import(`${out}/edits.mjs`)
const { syncArchive } = await import(`${out}/sync.mjs`)
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const ids = { person: id(10), place: id(20), occasion: id(30) }
const snapshot = ownerId => ({ version: 1, ownerId,
  records: [{ id: id(1), revision: 1, lotNo: 1, title: 'Ticket', story: 'Keep story', placeId: ids.place, occasionId: ids.occasion }, { id: id(2), revision: 1, lotNo: 2, title: 'Pin', placeId: null, occasionId: null }],
  people: [{ id: ids.person, revision: 1, name: 'Ada', note: 'Keep this note' }], places: [{ id: ids.place, revision: 1, name: 'Paris', lat: 48, lng: 2 }], occasions: [{ id: ids.occasion, revision: 1, name: 'Trip' }],
  faces: [{ id: id(50), revision: 1, objectId: id(1), role: 'recto' }], objectPeople: [{ personId: ids.person, objectId: id(1), role: 'given_by' }, { personId: ids.person, objectId: id(1), role: 'depicted' }],
  tags: [], collections: [], memberships: [], objectTags: [], pendingIntake: [], tombstones: [],
})
const projected = async owner => { const { archive, operations } = await store.readLibrary(owner); return projectArchive(archive.snapshot, operations) }
const save = async (owner, entity = 'person') => store.saveTaxonomyDeletion(owner, entity, ids[entity], JSON.stringify(taxonomyDeletionBase(await projected(owner), entity, ids[entity])))
const review = async (owner, operationId) => { const { archive, operations } = await store.readLibrary(owner); return reviewTaxonomyDeletion(archive, operations, operationId) }
const originalAdd = IDBObjectStore.prototype.add, originalFetch = globalThis.fetch, originalNow = Date.now
let checks = 0
async function check(name, run) { await run(); console.log(`✓ ${name}`); checks++ }
function conflict(entry, saved) { return { operationId: entry.operationId, outcome: 'conflict', conflict: { entity: entry.mutation.entity, id: entry.mutation.id, revision: 1, current: saved[taxonomyKind[entry.mutation.entity]][0], fields: ['entry', 'links'] } } }

try {
  await check('each deletion is durable, owner-scoped, and removes only its relationships', async () => {
    for (const entity of ['person', 'place', 'occasion']) {
      const owner = `project-${entity}`, saved = snapshot(owner)
      await store.replaceSnapshot(owner, saved)
      const entry = await save(owner, entity), local = await projected(owner)
      assert.equal(local[taxonomyKind[entity]].length, 0)
      assert.equal(local.records.length, 2)
      assert.equal(local.records[0].story, 'Keep story')
      assert.deepEqual(local.faces, saved.faces)
      if (entity === 'person') { assert.deepEqual(local.records[0].givenBy, []); assert.deepEqual(local.records[0].depicted, []); assert.equal(local.objectPeople.length, 0) }
      else assert.equal(local.records[0][entity === 'place' ? 'placeId' : 'occasionId'], null)
      assert.deepEqual((await store.readArchive(owner)).snapshot, saved)
      assert.deepEqual((await store.listOperations(owner))[0], entry)
      assert.equal(projectArchive(saved, [{ ...entry, ownerId: 'foreign' }])[taxonomyKind[entity]].length, 1)
      await assert.rejects(save(owner, entity), /already removed/)
      await assert.rejects(store.saveTaxonomyName(owner, entity, ids[entity], String(entry.baseRecord.name), 'No'), /Sync this entry/)
    }
  })

  await check('stale metadata and links, pending renames, local-only entries and foreign owners cannot delete', async () => {
    const owner = 'stale', saved = snapshot(owner)
    await store.replaceSnapshot(owner, saved)
    const expected = JSON.stringify(taxonomyDeletionBase(saved, 'person', ids.person))
    await store.saveObjectChanges(owner, id(2), (await projected(owner)).records[1], { mentioned: [{ id: ids.person, name: 'Ada' }] })
    await assert.rejects(store.saveTaxonomyDeletion(owner, 'person', ids.person, expected), /another tab/)
    const fresh = JSON.stringify(taxonomyDeletionBase(await projected(owner), 'person', ids.person))
    await store.saveTaxonomyName(owner, 'person', ids.person, 'Ada', 'New Ada')
    await assert.rejects(store.saveTaxonomyDeletion(owner, 'person', ids.person, fresh), /saved rename/)
    await assert.rejects(store.saveTaxonomyDeletion('foreign', 'person', ids.person, fresh))
    const other = 'local-only'; await store.replaceSnapshot(other, snapshot(other))
    await store.saveObjectChanges(other, id(2), (await projected(other)).records[1], { givenBy: [{ id: id(99), name: 'New friend', create: true }] })
    await assert.rejects(store.saveTaxonomyDeletion(other, 'person', id(99), JSON.stringify(taxonomyDeletionBase(await projected(other), 'person', id(99)))), /Sync this entry/)
  })

  await check('later object edits cannot resurrect pending or tombstoned references, even with create', async () => {
    const owner = 'dependent'; await store.replaceSnapshot(owner, snapshot(owner)); await save(owner)
    let record = (await projected(owner)).records[1]
    await assert.rejects(store.saveObjectChanges(owner, record.id, record, { givenBy: [{ id: ids.person, name: 'Ada', create: true }] }), /removed/)
    await store.saveObjectChanges(owner, record.id, record, { title: 'Independent edit' })
    assert.equal((await projected(owner)).records[1].title, 'Independent edit')
    const tomb = snapshot('tomb'); tomb.people = []; tomb.objectPeople = []; tomb.tombstones = [{ entity: 'person', id: ids.person, revision: 2, deletedAt: new Date().toISOString() }]
    await store.replaceSnapshot('tomb', tomb); record = (await projected('tomb')).records[1]
    await assert.rejects(store.saveObjectChanges('tomb', record.id, record, { mentioned: [{ id: ids.person, name: 'Ada', create: true }] }), /removed/)
    for (const entity of ['place', 'occasion']) {
      const localOwner = `scalar-${entity}`; await store.replaceSnapshot(localOwner, snapshot(localOwner)); await save(localOwner, entity)
      const current = (await projected(localOwner)).records[1]
      await assert.rejects(store.saveObjectChanges(localOwner, current.id, current, { [entity === 'place' ? 'placeId' : 'occasionId']: ids[entity] }), /Choose a place or occasion/)
    }
  })

  await check('aborted deletion and review transactions preserve the complete original state', async () => {
    const owner = 'abort'; await store.replaceSnapshot(owner, snapshot(owner))
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(save(owner)); IDBObjectStore.prototype.add = originalAdd
    assert.deepEqual(await store.readLibrary(owner), before)
    const entry = await save(owner), remote = snapshot(owner); remote.people[0].note = 'New note'
    await store.recordResponse(owner, conflict(entry, remote)); await store.replaceSnapshot(owner, remote)
    const current = await review(owner, entry.operationId), saved = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, true)); IDBObjectStore.prototype.add = originalAdd
    assert.deepEqual(await store.readLibrary(owner), saved)
  })

  await check('review requires a post-response snapshot, survives identical clocks, and rejects stale choices', async () => {
    Date.now = () => 1000
    const owner = 'review', remote = snapshot(owner); await store.replaceSnapshot(owner, remote)
    const entry = await save(owner)
    remote.people[0].note = 'Remote note'; remote.objectPeople.push({ personId: ids.person, objectId: id(2), role: 'mentioned' })
    await store.recordResponse(owner, conflict(entry, remote))
    let current = await review(owner, entry.operationId)
    await assert.rejects(store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, true), /refresh/)
    await store.replaceSnapshot(owner, remote); current = await review(owner, entry.operationId)
    assert.equal(current.refreshed, true); assert.equal(current.base.metadata.note, 'Remote note'); assert.equal(current.base.links.length, 3)
    await store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, true)
    const next = (await store.listOperations(owner))[0]
    assert.notEqual(next.operationId, entry.operationId); assert.equal(next.response, undefined); assert.deepEqual(next.mutation.base, current.base)
    assert.equal(entry.mutation.base.metadata.note, 'Keep this note')
    await assert.rejects(store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, false), /another tab/)
    remote.people[0].note = 'Changed again'
    Date.now = () => 999
    globalThis.fetch = async (_url, init) => init.method === 'POST' ? Response.json(conflict(next, remote)) : new Response('', { status: 503 })
    await assert.rejects(syncArchive(owner, { isActiveOwner: () => true }), /refresh/)
    const repeated = await review(owner, next.operationId)
    assert.equal(repeated.refreshed, false)
    await assert.rejects(store.resolveTaxonomyDeletion(owner, next.operationId, repeated.token, true), /refresh/)
    await store.replaceSnapshot(owner, remote)
    assert.equal((await review(owner, next.operationId)).refreshed, true)
    Date.now = originalNow
  })

  await check('keeping a reviewed entry restores its current links; missing entries are only dismissed', async () => {
    for (const missing of [false, true]) {
      const owner = `keep-${missing}`, remote = snapshot(owner); await store.replaceSnapshot(owner, remote)
      const entry = await save(owner); remote.people[0].note = 'Remote'
      if (missing) { remote.people = []; remote.objectPeople = [] }
      const response = conflict(entry, remote); if (missing) response.conflict.current = null
      await store.recordResponse(owner, response); await store.replaceSnapshot(owner, remote)
      const current = await review(owner, entry.operationId)
      if (missing) await assert.rejects(store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, true), /cannot be retried/)
      await store.resolveTaxonomyDeletion(owner, entry.operationId, current.token, false)
      assert.equal((await store.listOperations(owner)).length, 0)
      assert.equal((await projected(owner)).people.length, missing ? 0 : 1)
      assert.equal((await projected(owner)).objectPeople.length, missing ? 0 : 2)
    }
  })

  await check('lost acknowledgement replays exact payload and snapshot refresh confirms local deletion', async () => {
    const owner = 'replay', remote = snapshot(owner); await store.replaceSnapshot(owner, remote); const entry = await save(owner)
    const requests = []; let lose = true
    globalThis.fetch = async (_url, init) => {
      if (init.method !== 'POST') return Response.json(remote)
      requests.push(init.body); remote.people = []; remote.objectPeople = []
      if (lose) { lose = false; throw new Error('lost reply') }
      return Response.json({ operationId: entry.operationId, outcome: 'applied' })
    }
    await assert.rejects(syncArchive(owner, { isActiveOwner: () => true }), /lost reply/)
    assert.equal((await store.listOperations(owner)).length, 1)
    assert.equal((await syncArchive(owner, { isActiveOwner: () => true })).status, 'synced')
    assert.equal(requests[0], requests[1]); assert.equal((await store.listOperations(owner)).length, 0)
  })

  await check('foreign/malformed conflicts and account changes cannot acknowledge deletions', async () => {
    const owner = 'bad', saved = snapshot(owner); await store.replaceSnapshot(owner, saved); const entry = await save(owner)
    for (const alter of [r => ({ ...r, conflict: undefined }), r => ({ ...r, conflict: { ...r.conflict, id: id(99) } }), r => ({ ...r, conflict: { ...r.conflict, current: { ...r.conflict.current, ownerId: 'foreign' } } })]) {
      globalThis.fetch = async () => Response.json(alter(conflict(entry, saved)))
      await assert.rejects(syncArchive(owner, { isActiveOwner: () => true }), /incomplete/)
      assert.equal((await store.listOperations(owner))[0].response, undefined)
    }
    let active = true
    globalThis.fetch = async () => { active = false; return Response.json({ operationId: entry.operationId, outcome: 'applied' }) }
    assert.equal((await syncArchive(owner, { isActiveOwner: () => active })).status, 'locked')
    assert.equal((await store.listOperations(owner))[0].response, undefined)
  })
  console.log(`verify-offline-taxonomy-delete: passed ${checks} scenarios using actual IndexedDB and sync`)
} finally { IDBObjectStore.prototype.add = originalAdd; globalThis.fetch = originalFetch; Date.now = originalNow; rmSync(out, { recursive: true, force: true }) }
