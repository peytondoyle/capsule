import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
const { indexedDB, IDBKeyRange, IDBObjectStore } = require('fake-indexeddb')
Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-taxonomy-`)
for (const name of ['store', 'edits', 'taxonomy', 'sync', 'library']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', outfile: `${outdir}/${name}.mjs`, platform: 'node' })
const store = await import(`${outdir}/store.mjs`)
const { projectArchive } = await import(`${outdir}/edits.mjs`)
const { reviewTaxonomyName, taxonomyKind } = await import(`${outdir}/taxonomy.mjs`)
const { syncArchive } = await import(`${outdir}/sync.mjs`)
const { linkedNames, searchArchive } = await import(`${outdir}/library.mjs`)
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const ids = { person: id(10), place: id(20), occasion: id(30) }
const snapshot = ownerId => ({
  version: 1, ownerId, records: [{ id: id(1), revision: 1, title: 'Ticket', lotNo: 1, placeId: ids.place, occasionId: ids.occasion, receivedAt: null }],
  faces: [], people: [{ id: ids.person, revision: 1, name: 'Friend', note: 'A person note' }, { id: id(11), revision: 1, name: 'Other person' }],
  places: [{ id: ids.place, revision: 1, name: 'Venue', kind: 'concert_hall' }, { id: id(21), revision: 1, name: 'Other place' }],
  occasions: [{ id: ids.occasion, revision: 1, name: 'Trip', date: '2024-05-04' }, { id: id(31), revision: 1, name: 'Other occasion' }],
  tags: [], collections: [], memberships: [], objectPeople: [{ objectId: id(1), personId: ids.person, role: 'given_by' }, { objectId: id(1), personId: ids.person, role: 'depicted' }], objectTags: [], pendingIntake: [], tombstones: [],
})
const local = async owner => { const value = await store.readLibrary(owner); return projectArchive(value.archive.snapshot, value.operations) }
const review = async (owner, entity = 'person') => { const value = await store.readLibrary(owner); return reviewTaxonomyName(value.archive, value.operations, entity, ids[entity]) }
const json = value => new Response(JSON.stringify(value))
const active = { isActiveOwner: () => true }
let checks = 0
async function check(name, run) { await run(); checks++; console.log(`✓ ${name}`) }
const originalFetch = globalThis.fetch
const originalAdd = IDBObjectStore.prototype.add

function mockServer(remote, { loseReply = false, rejected = false } = {}) {
  const receipts = new Map(), requests = []
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers['x-capsule-owner'], remote.ownerId)
    if (init.method !== 'POST') return json(remote)
    const request = JSON.parse(init.body), mutation = request.mutation
    requests.push(init.body)
    if (!receipts.has(request.operationId)) {
      const kind = taxonomyKind[mutation.entity], current = remote[kind].find(row => row.id === mutation.id)
      const conflict = !current || (current.name !== mutation.base.name && current.name !== mutation.values.name)
      const taken = rejected || remote[kind].some(row => row.id !== mutation.id && row.name.toLowerCase() === mutation.values.name.toLowerCase())
      const response = conflict || taken
        ? { operationId: request.operationId, outcome: taken ? 'rejected' : 'conflict', ...(taken ? { reason: 'name_taken' } : {}), conflict: { entity: mutation.entity, id: mutation.id, revision: current?.revision ?? 99, current: current ? structuredClone(current) : null, fields: ['name'] } }
        : { operationId: request.operationId, outcome: 'applied' }
      if (response.outcome === 'applied') Object.assign(current, { name: mutation.values.name, revision: current.revision + 1 })
      receipts.set(request.operationId, response)
    }
    if (loseReply) { loseReply = false; throw new Error('lost rename acknowledgement') }
    return json(receipts.get(request.operationId))
  }
  return requests
}

try {
  await check('all three names save durably with exact IDs, trimmed values and immutable successive bases', async () => {
    const owner = 'successive', original = snapshot(owner)
    await store.replaceSnapshot(owner, original)
    for (const entity of ['person', 'place', 'occasion']) {
      const kind = taxonomyKind[entity], before = original[kind][0].name
      const first = await store.saveTaxonomyName(owner, entity, ids[entity], before, `  First ${entity}  `)
      const second = await store.saveTaxonomyName(owner, entity, ids[entity], `First ${entity}`, `Final ${entity}`)
      assert.notEqual(first.operationId, second.operationId)
      assert.deepEqual(first.mutation, { type: 'taxonomy.upsert', entity, id: ids[entity], baseRevision: 1, base: { name: before }, values: { name: `First ${entity}` } })
      assert.equal(second.mutation.base.name, `First ${entity}`)
      assert.equal(second.baseRecord.name, `First ${entity}`)
      await assert.rejects(store.saveTaxonomyName(owner, entity, ids[entity], before, 'Stale'), /another tab/)
      assert.equal(await store.saveTaxonomyName(owner, entity, ids[entity], `Final ${entity}`, `Final ${entity}`), undefined)
    }
    assert.equal((await store.listOperations(owner)).length, 6)
    assert.deepEqual((await store.readArchive(owner)).snapshot, original)
    const projected = await local(owner), record = projected.records[0]
    assert.equal(record.givenBy[0].name, 'Final person')
    assert.equal(record.depicted[0].name, 'Final person')
    assert.equal(record.atPlace[0].name, 'Final place')
    assert.equal(record.onOccasion[0].name, 'Final occasion')
    assert.deepEqual(linkedNames(projected, record).people, ['Final person'])
    for (const query of ['Final person', 'Final place', 'Final occasion']) assert.equal(searchArchive(projected, query).length, 1)
    for (const filter of [`person:${ids.person}`, `place:${ids.place}`, `occasion:${ids.occasion}`]) assert.equal(searchArchive(projected, '', filter).length, 1)
  })

  await check('local duplicate names, empty/long values, new local entries and foreign owners are refused', async () => {
    const owner = 'validation', saved = snapshot(owner)
    await store.replaceSnapshot(owner, saved)
    for (const entity of ['person', 'place', 'occasion']) {
      const name = saved[taxonomyKind[entity]][0].name
      for (const next of ['', '  ', 'x'.repeat(251), `OTHER ${entity}`]) await assert.rejects(store.saveTaxonomyName(owner, entity, ids[entity], name, next))
    }
    await assert.rejects(store.saveTaxonomyName('foreign', 'person', ids.person, 'Friend', 'Intruder'))
    assert.equal((await store.listOperations(owner)).length, 0)
    const record = (await local(owner)).records[0]
    await store.saveObjectChanges(owner, id(1), record, { givenBy: [{ id: id(40), name: 'Local friend', create: true }] })
    await assert.rejects(store.saveTaxonomyName(owner, 'person', id(40), 'Local friend', 'Rename local'), /Sync this entry/)
    await assert.rejects(store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'LOCAL FRIEND'), /already exists/)
    const foreign = { ownerId: 'foreign', sequence: 99, operationId: id(99), createdAt: 1, mutation: { type: 'taxonomy.upsert', entity: 'person', id: ids.person, values: { name: 'Intruder' } } }
    assert.equal(projectArchive(saved, [foreign]).people[0].name, 'Friend')
    assert.equal(reviewTaxonomyName(await store.readArchive(owner), [{ ...foreign, response: { outcome: 'conflict' } }], 'person', ids.person), null)
  })

  await check('stale embedded references cannot override canonical names after refresh or a pending rename', async () => {
    const owner = 'canonical', saved = snapshot(owner)
    await store.replaceSnapshot(owner, saved)
    const record = (await local(owner)).records[0]
    await store.saveObjectChanges(owner, id(1), record, { givenBy: [{ id: ids.person, name: 'Old embedded person', create: true }], atPlace: [{ id: ids.place, name: 'Old embedded place' }] })
    const newer = snapshot(owner)
    newer.people[0].name = 'Canonical person'; newer.places[0].name = 'Canonical place'
    await store.replaceSnapshot(owner, newer)
    let projected = await local(owner)
    assert.equal(projected.records[0].givenBy[0].name, 'Canonical person')
    assert.equal(projected.records[0].atPlace[0].name, 'Canonical place')
    assert.equal(projected.people[0].localOnly, undefined)
    await store.saveTaxonomyName(owner, 'person', ids.person, 'Canonical person', 'Pending person')
    projected = await local(owner)
    assert.equal(projected.records[0].givenBy[0].name, 'Pending person')
    assert.equal(projected.records[0].depicted[0].name, 'Pending person')
    assert.equal(projected.people[0].name, 'Pending person')
  })

  await check('lost acknowledgements reuse exact operations and successive server bases apply in order', async () => {
    const owner = 'retry', remote = snapshot(owner)
    await store.replaceSnapshot(owner, remote)
    await store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'First')
    await store.saveTaxonomyName(owner, 'person', ids.person, 'First', 'Final')
    const requests = mockServer(remote, { loseReply: true })
    await assert.rejects(syncArchive(owner, active), /lost rename acknowledgement/)
    assert.equal((await store.listOperations(owner)).length, 2)
    assert.equal((await local(owner)).people[0].name, 'Final')
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    assert.equal(requests[0], requests[1])
    assert.equal(JSON.parse(requests[2]).mutation.base.name, 'First')
    assert.equal(remote.people[0].name, 'Final')
    assert.equal((await store.listOperations(owner)).length, 0)
    assert.equal((await local(owner)).records[0].givenBy[0].name, 'Final')
  })

  await check('conflict review preserves final local name, rebases atomically and rejects stale choices', async () => {
    const owner = 'review', remote = snapshot(owner)
    await store.replaceSnapshot(owner, remote)
    await store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'My first')
    await store.saveTaxonomyName(owner, 'person', ids.person, 'My first', 'My final')
    await store.saveObjectChanges(owner, id(1), (await local(owner)).records[0], { story: 'Keep this object edit' })
    remote.people[0] = { ...remote.people[0], name: 'Their name', revision: 5, note: 'New remote note' }
    mockServer(remote)
    assert.equal((await syncArchive(owner, active)).status, 'conflict')
    const current = await review(owner)
    assert.equal(current.local.name, 'My final')
    assert.equal(current.remote.name, 'Their name')
    await assert.rejects(store.saveTaxonomyName(owner, 'person', ids.person, 'My final', 'Later'), /Review/)
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.resolveTaxonomyName(owner, 'person', ids.person, current.token, 'My final'))
    IDBObjectStore.prototype.add = originalAdd
    assert.deepEqual(await store.readLibrary(owner), before)
    await store.resolveTaxonomyName(owner, 'person', ids.person, current.token, 'My final')
    const edits = await store.listOperations(owner), renamed = edits[0]
    assert.equal(edits.length, 2)
    assert.equal(renamed.mutation.base.name, 'Their name')
    assert.equal(renamed.mutation.baseRevision, 5)
    assert.equal(renamed.mutation.values.name, 'My final')
    assert.ok(current.edits.every(entry => entry.operationId !== renamed.operationId))
    assert.equal((await local(owner)).people.find(row => row.id === ids.person).note, 'New remote note')
    assert.equal((await local(owner)).records[0].story, 'Keep this object edit')
    await assert.rejects(store.resolveTaxonomyName(owner, 'person', ids.person, current.token, null), /another tab/)
  })

  await check('discard refreshes only target metadata and leaves object links and other pending edits intact', async () => {
    const owner = 'discard', saved = snapshot(owner)
    await store.replaceSnapshot(owner, saved)
    const rename = await store.saveTaxonomyName(owner, 'place', ids.place, 'Venue', 'Local venue')
    await store.saveObjectChanges(owner, id(1), (await local(owner)).records[0], { title: 'Keep title' })
    await store.recordResponse(owner, { operationId: rename.operationId, outcome: 'conflict', conflict: { entity: 'place', id: ids.place, revision: 5, current: { ...saved.places[0], name: 'Remote venue', revision: 5, kind: 'museum' }, fields: ['name'] } })
    const before = (await store.readArchive(owner)).snapshot, current = await review(owner, 'place')
    await store.resolveTaxonomyName(owner, 'place', ids.place, current.token, null)
    const after = (await store.readArchive(owner)).snapshot
    for (const field of ['records', 'objectPeople', 'objectTags', 'memberships', 'people', 'occasions', 'faces']) assert.deepEqual(after[field], before[field])
    assert.equal(after.places.find(row => row.id === ids.place).name, 'Remote venue')
    assert.equal(after.places.find(row => row.id === ids.place).kind, 'museum')
    assert.equal((await local(owner)).records[0].title, 'Keep title')
    assert.equal((await local(owner)).records[0].atPlace[0].name, 'Remote venue')
    assert.equal((await store.listOperations(owner)).length, 1)
  })

  await check('name_taken rejection permits a fresh choice while deleted targets cannot be recreated', async () => {
    const owner = 'taken', remote = snapshot(owner)
    await store.replaceSnapshot(owner, remote)
    await store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'Taken elsewhere')
    remote.people[1].name = 'Taken elsewhere'
    mockServer(remote)
    assert.equal((await syncArchive(owner, active)).status, 'rejected')
    let current = await review(owner)
    assert.equal(current.reason, 'name_taken')
    assert.equal(current.remote.id, ids.person)
    await assert.rejects(store.resolveTaxonomyName(owner, 'person', ids.person, current.token, 'TAKEN ELSEWHERE'), /already exists/)
    await store.resolveTaxonomyName(owner, 'person', ids.person, current.token, 'Available')
    assert.equal((await local(owner)).people.find(row => row.id === ids.person).name, 'Available')

    const deleted = 'deleted', removed = snapshot(deleted)
    await store.replaceSnapshot(deleted, removed)
    await store.saveTaxonomyName(deleted, 'person', ids.person, 'Friend', 'Remember this name')
    removed.people = removed.people.filter(row => row.id !== ids.person)
    mockServer(removed)
    assert.equal((await syncArchive(deleted, active)).status, 'conflict')
    current = await review(deleted)
    assert.equal(current.remote, null)
    assert.equal(current.local.name, 'Remember this name')
    await assert.rejects(store.resolveTaxonomyName(deleted, 'person', ids.person, current.token, 'Recreate'), /deleted/)
    await store.resolveTaxonomyName(deleted, 'person', ids.person, current.token, null)
    assert.equal((await store.listOperations(deleted)).length, 0)
    assert.equal((await local(deleted)).people.some(row => row.id === ids.person), false)
  })

  await check('malformed or foreign conflict details cannot enter durable review state', async () => {
    const variants = [
      response => ({ ...response, conflict: undefined }),
      response => ({ ...response, conflict: { ...response.conflict, id: id(999) } }),
      response => ({ ...response, conflict: { ...response.conflict, entity: 'place' } }),
      response => ({ ...response, conflict: { ...response.conflict, fields: [] } }),
      response => ({ ...response, conflict: { ...response.conflict, current: { ...response.conflict.current, ownerId: 'foreign' } } }),
      response => ({ ...response, conflict: { ...response.conflict, current: { ...response.conflict.current, revision: 9 } } }),
      response => ({ ...response, conflict: { ...response.conflict, current: { ...response.conflict.current, name: 123 } } }),
      response => ({ ...response, reason: 'unknown' }),
      response => ({ ...response, outcome: 'rejected', reason: 'name_taken', conflict: undefined }),
    ]
    for (const [index, alter] of variants.entries()) {
      const owner = `malformed-${index}`, saved = snapshot(owner)
      await store.replaceSnapshot(owner, saved)
      const entry = await store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'Local')
      globalThis.fetch = async () => json(alter({ operationId: entry.operationId, outcome: 'conflict', conflict: { entity: 'person', id: ids.person, revision: 1, current: saved.people[0], fields: ['name'] } }))
      await assert.rejects(syncArchive(owner, active), /name conflict details are incomplete/)
      assert.equal((await store.listOperations(owner))[0].response, undefined)
      assert.equal((await local(owner)).people[0].name, 'Local')
    }
  })

  await check('account changes cannot acknowledge in-flight rename; aborted saves roll back', async () => {
    const owner = 'changed', saved = snapshot(owner)
    await store.replaceSnapshot(owner, saved)
    const entry = await store.saveTaxonomyName(owner, 'person', ids.person, 'Friend', 'Local')
    let activeOwner = true
    globalThis.fetch = async () => { activeOwner = false; return json({ operationId: entry.operationId, outcome: 'applied' }) }
    assert.equal((await syncArchive(owner, { isActiveOwner: () => activeOwner })).status, 'locked')
    assert.equal((await store.listOperations(owner))[0].response, undefined)
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function(value, ...rest) { const request = originalAdd.call(this, value, ...rest); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.saveTaxonomyName(owner, 'person', ids.person, 'Local', 'Interrupted'))
    IDBObjectStore.prototype.add = originalAdd
    assert.deepEqual(await store.readLibrary(owner), before)
  })
  console.log(`offline taxonomy verification passed: ${checks} scenarios; actual IndexedDB, projection and sync, no external services`)
} finally { globalThis.fetch = originalFetch; IDBObjectStore.prototype.add = originalAdd; rmSync(outdir, { recursive: true, force: true }) }
