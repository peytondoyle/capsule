// OFFLINE_RUNTIME resolves fake-indexeddb/pg; use the approved private local PostgreSQL socket.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { userInfo, tmpdir } from 'node:os'
import vm from 'node:vm'
import { buildSync, transformSync } from 'esbuild'
const require = createRequire(import.meta.url), runtime = createRequire(`${process.env.OFFLINE_RUNTIME}/package.json`)
const { Pool } = runtime('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const { indexedDB, IDBKeyRange, IDBObjectStore } = runtime('fake-indexeddb'); Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const connection = { host: process.env.CAPSULE_TEST_PG_SOCKET, port: Number(process.env.CAPSULE_TEST_PG_PORT), user: userInfo().username }; assert.ok(connection.host && connection.port)
const admin = new Pool({ ...connection, database: 'postgres' }), database = `pending_shelf_links_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-pending-shelf-links-`)
let pool
function load(file, dependencies, source = readFileSync(file, 'utf8')) { const loaded = { exports: {} }; vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports, Date, require: name => { assert.ok(name in dependencies, name); return dependencies[name] } }); return loaded.exports }
const active = { isActiveOwner: () => true }
const originalAdd = IDBObjectStore.prototype.add
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(`drizzle/${name}.sql`, 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }), db = drizzle(pool, { schema })
  const links = load('src/lib/offline/links.ts', {}), taxonomy = load('src/lib/offline/taxonomy.ts', {})
  const deps = { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema }
  const serverDeps = { ...deps, '@/lib/offline/shelves': load('src/lib/offline/shelves.ts', {}), '@/lib/offline/taxonomy': load('src/lib/offline/taxonomy.ts', {}), './objects': load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} }), '@/lib/offline/links': links, '@/lib/offline/taxonomy-delete': load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': taxonomy }), './sync-links': load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links }) };
  const server = load('src/server/sync.ts', serverDeps)
  const oldServer = load('src/server/sync.ts', serverDeps, execFileSync('git', ['show', '7e15b3050b96f5734fed2574148f0a67e43880cc:src/server/sync.ts'], { encoding: 'utf8' }))
  for (const name of ['store', 'edits', 'sync', 'shelves']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`)
  const { reviewShelfCreation } = await import(`${outdir}/shelves.mjs`), { reviewObject } = await import(`${outdir}/edits.mjs`)
  const projected = async owner => { const library = await store.readLibrary(owner); return projectArchive(library.archive.snapshot, library.operations) }
  let serial = 0, lose = false, sent = [], activeOwner = true, malformed
  globalThis.fetch = async (_url, init) => {
    const owner = init.headers['x-capsule-owner']
    if (init.method !== 'POST') return Response.json(await server.getSyncSnapshot(owner))
    const request = JSON.parse(init.body); sent.push(init.body)
    const response = malformed ?? await server.applySyncMutation(owner, request)
    if (lose) { lose = false; throw new Error('lost acknowledgement') }
    return Response.json(malformed ? { ...response, operationId: request.operationId } : response)
  }
  async function setup() {
    const owner = `pending-shelf-${++serial}`
    await db.insert(schema.users).values({ id: owner })
    const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Card' }).returning()
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    return { owner, object }
  }

  const wire = entry => ({ operationId: entry.operationId, mutation: { ...entry.mutation, type: 'object.patchWithShelfDependencies' } })
  const saveLink = async (f, creation, extra = {}) => {
    const snapshot = await projected(f.owner), record = snapshot.records.find(row => row.id === f.object.id)
    const selected = links.linkChoices(snapshot, 'inCollections').find(ref => ref.id === creation.mutation.id)
    assert.ok(selected); assert.equal(selected.create, undefined)
    return store.saveObjectChanges(f.owner, f.object.id, record, { inCollections: [...record.inCollections, selected], ...extra })
  }
  {
    const f = await setup(), creation = await store.createShelf(f.owner, 'Trip'), first = await saveLink(f, creation, { story: 'Story kept' })
    const [second] = await db.insert(schema.objects).values({ ownerId: f.owner, lotNo: 2, title: 'Pin' }).returning()
    await store.replaceSnapshot(f.owner, await server.getSyncSnapshot(f.owner))
    await saveLink({ ...f, object: second }, creation)
    const snapshot = await projected(f.owner)
    assert.equal(snapshot.memberships.length, 2); assert.equal(snapshot.collections[0].localOnly, true)
    assert.equal(snapshot.records[0].inCollections[0].create, undefined)
    assert.equal(first.mutation.shelfDependencies[0].operationId, creation.operationId)
    sent = []; lose = true
    await assert.rejects(syncArchive(f.owner, active), /lost acknowledgement/)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced'); assert.equal(sent[0], sent[1])
    assert.equal(JSON.parse(sent[2]).mutation.type, 'object.patchWithShelfDependencies')
    const remote = await server.getSyncSnapshot(f.owner)
    assert.equal(remote.collections.length, 1); assert.equal(remote.memberships.length, 2); assert.equal(remote.records.find(row => row.id === f.object.id).story, 'Story kept')
    assert.equal((await store.listOperations(f.owner)).length, 0)
  }
  console.log('1 new shelf→two object links survive reload, exact lost-ack retry, explicit references and real sync')
  for (const collision of ['same-owner', 'foreign-owner', 'tombstone', 'mapping']) {
    const f = await setup(), creation = await store.createShelf(f.owner, 'Failed intention'), linked = await saveLink(f, creation, { title: 'Keep title' }), id = creation.mutation.id
    const snap = await projected(f.owner), later = await store.saveObjectChanges(f.owner, f.object.id, snap.records[0], { story: 'Keep later story' })
    assert.equal(later.mutation.shelfDependencies[0].operationId, creation.operationId)
    if (collision.endsWith('owner')) {
      const owner = collision === 'same-owner' ? f.owner : (await setup()).owner
      await db.insert(schema.collections).values({ id, ownerId: owner, name: 'Existing canonical shelf', kind: 'shelf' })
      if (collision === 'same-owner') {
        const [other] = await db.insert(schema.objects).values({ ownerId: f.owner, lotNo: 2, title: 'Existing member' }).returning()
        await db.insert(schema.collectionObjects).values({ objectId: other.id, collectionId: id, sortOrder: 17 })
      }
    } else if (collision === 'tombstone') await db.insert(schema.syncEntities).values({ ownerId: f.owner, entity: 'collection', entityId: id, revision: 2, deletedAt: new Date() })
    else await db.insert(schema.syncClientIds).values({ ownerId: f.owner, entity: 'collection', clientId: id, serverId: crypto.randomUUID() })
    sent = []; assert.equal((await syncArchive(f.owner, active)).status, 'rejected'); assert.equal(sent.length, 1)
    const local = await projected(f.owner)
    assert.equal(local.records.find(row => row.id === f.object.id).inCollections.length, 0)
    assert.equal(local.records.find(row => row.id === f.object.id).title, 'Keep title')
    assert.equal(local.memberships.length, collision === 'same-owner' ? 1 : 0)
    if (collision === 'same-owner') assert.equal(local.memberships[0].sortOrder, 17)
    const review = reviewShelfCreation(await store.listOperations(f.owner), creation.operationId)
    assert.equal(review.affected.length, 2); assert.equal(review.safe, true)
    assert.equal(review.affected[0].mutation.patch.changes.inCollections[0].name, 'Failed intention')
    const before = await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.discardShelfCreation(f.owner, creation.operationId, review.token))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(f.owner), before)
    await store.discardShelfCreation(f.owner, creation.operationId, review.token)
    const remaining = await store.listOperations(f.owner)
    assert.equal(remaining.length, 2); assert.notEqual(remaining[0].operationId, linked.operationId)
    assert.equal(remaining[0].sequence, linked.sequence); assert.equal(remaining[1].sequence, later.sequence)
    assert.equal(remaining[0].mutation.patch.changes.title, 'Keep title'); assert.equal(remaining[0].mutation.patch.changes.inCollections, undefined)
    assert.equal(remaining[1].mutation.patch.changes.story, 'Keep later story'); assert.equal(remaining[1].baseRecord.inCollections.length, 0)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    const after = await server.getSyncSnapshot(f.owner)
    assert.equal(after.records.find(row => row.id === f.object.id).title, 'Keep title')
    assert.equal(after.records.find(row => row.id === f.object.id).story, 'Keep later story')
    assert.equal(after.memberships.length, collision === 'same-owner' ? 1 : 0)
  }
  console.log('2 rejected owner/UUID/tombstone/mapping creators never send or project bad links; atomic narrow cancellation preserves scalar edits and canonical members')
  {
    const f = await setup(), creation = await store.createShelf(f.owner, 'Trip'), entry = await saveLink(f, creation)
    const request = wire(entry)
    assert.equal((await oldServer.applySyncMutation(f.owner, request)).outcome, 'rejected')
    assert.equal((await server.getSyncSnapshot(f.owner)).memberships.length, 0)
    await server.applySyncMutation(f.owner, creation)
    for (const mode of ['missing', 'wrong-shelf', 'legacy', 'foreign', 'failed']) {
      const operationId = crypto.randomUUID()
      if (mode !== 'missing') await db.insert(schema.syncOperations).values({ ownerId: mode === 'foreign' ? (await setup()).owner : f.owner, operationId, response: { operationId, outcome: mode === 'failed' ? 'rejected' : 'applied', ...(mode === 'legacy' ? {} : { createdShelfId: mode === 'wrong-shelf' ? crypto.randomUUID() : creation.mutation.id }) } })
      const invalid = { ...request, operationId: crypto.randomUUID(), mutation: { ...request.mutation, shelfDependencies: [{ id: creation.mutation.id, operationId }] } }
      assert.equal((await server.applySyncMutation(f.owner, invalid)).outcome, 'rejected')
    }
    const response = await server.applySyncMutation(f.owner, creation); assert.equal(response.createdShelfId, creation.mutation.id)
    assert.equal((await server.applySyncMutation(f.owner, { ...entry, operationId: crypto.randomUUID() })).outcome, 'rejected')
    for (const dependency of [[], [{ id: 'bad', operationId: creation.operationId }], [entry.mutation.shelfDependencies[0], entry.mutation.shelfDependencies[0]]]) assert.equal((await server.applySyncMutation(f.owner, { ...request, operationId: crypto.randomUUID(), mutation: { ...request.mutation, shelfDependencies: dependency } })).outcome, 'rejected')
    assert.equal((await server.applySyncMutation(f.owner, request)).outcome, 'applied')
    assert.equal((await server.getSyncSnapshot(f.owner)).memberships.length, 1)
  }
  console.log('3 actual baseline server fails closed; missing/foreign/legacy/mismatched/failed receipts and invalid dependency shapes refused')
  {
    const f = await setup(), snapshot = await projected(f.owner)
    await store.saveObjectChanges(f.owner, f.object.id, snapshot.records[0], { title: 'Local title' })
    const creation = await store.createShelf(f.owner, 'Trip'); await saveLink(f, creation)
    await db.update(schema.objects).set({ title: 'Remote title' }).where(orm.eq(schema.objects.id, f.object.id))
    assert.equal((await syncArchive(f.owner, active)).status, 'conflict')
    const library = await store.readLibrary(f.owner), review = reviewObject(library.archive, library.operations, f.object.id)
    await store.resolveObjectChanges(f.owner, f.object.id, review.token, { title: 'local', inCollections: 'local' })
    const entries = await store.listOperations(f.owner)
    assert.equal(entries[0].operationId, creation.operationId); assert.equal(entries[1].mutation.shelfDependencies[0].operationId, creation.operationId)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    assert.equal((await server.getSyncSnapshot(f.owner)).memberships.length, 1)
  }
  console.log('4 conflict coalescing retains dependencies and creator-before-patch order')
  {
    const f = await setup(), creation = await store.createShelf(f.owner, 'No-op'), added = await saveLink(f, creation)
    await store.saveObjectChanges(f.owner, f.object.id, (await projected(f.owner)).records[0], { inCollections: [] })
    await store.recordResponse(f.owner, { operationId: creation.operationId, outcome: 'rejected' })
    let review = reviewShelfCreation(await store.listOperations(f.owner), creation.operationId)
    assert.equal(review.affected.length, 2)
    await store.recordResponse(f.owner, { operationId: added.operationId, outcome: 'applied' })
    await assert.rejects(store.discardShelfCreation(f.owner, creation.operationId, review.token), /changed/)
    review = reviewShelfCreation(await store.listOperations(f.owner), creation.operationId); assert.equal(review.safe, false)
    await assert.rejects(store.discardShelfCreation(f.owner, creation.operationId, review.token), /Pending/)
    const other = await setup(), newShelf = await store.createShelf(other.owner, 'Cancel'), link = await saveLink(other, newShelf)
    await store.recordResponse(other.owner, { operationId: newShelf.operationId, outcome: 'rejected' })
    const r = reviewShelfCreation(await store.listOperations(other.owner), newShelf.operationId)
    await store.discardShelfCreation(other.owner, newShelf.operationId, r.token)
    assert.equal((await store.listOperations(other.owner)).length, 0); assert.ok(link)
  }
  console.log('5 stale/answered recovery refused; empty replacement removed and successive unlink baselines tracked')
  {
    const f = await setup(), creation = await store.createShelf(f.owner, 'Removed'), entry = await saveLink(f, creation)
    await server.applySyncMutation(f.owner, creation)
    const writer = await pool.connect()
    try {
      await writer.query('begin'); await writer.query('delete from collections where id=$1', [creation.mutation.id])
      let settled = false
      const applying = server.applySyncMutation(f.owner, wire(entry)).finally(() => { settled = true })
      await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(settled, false)
      await writer.query('commit'); assert.equal((await applying).outcome, 'rejected')
      assert.equal((await server.getSyncSnapshot(f.owner)).memberships.length, 0)
    } finally { await writer.query('rollback'); writer.release() }
    const other = await setup(), parent = await store.createShelf(other.owner, 'Account'), child = await saveLink(other, parent), originalFetch = globalThis.fetch
    globalThis.fetch = async (...args) => { const result = await originalFetch(...args); activeOwner = false; return result }
    assert.equal((await syncArchive(other.owner, { isActiveOwner: () => activeOwner })).status, 'locked')
    assert.equal((await store.listOperations(other.owner))[0].response, undefined)
    globalThis.fetch = originalFetch; activeOwner = true
    assert.equal((await syncArchive(other.owner, active)).status, 'synced'); assert.ok(child)
  }
  console.log('6 concurrent parent removal is waited on/refused; account switch retains exact dependency chain')
  {
    const f = await setup(), [existing] = await db.insert(schema.collections).values({ ownerId: f.owner, name: 'Existing', kind: 'shelf' }).returning()
    await db.insert(schema.collectionObjects).values({ objectId: f.object.id, collectionId: existing.id, sortOrder: 19 })
    await store.replaceSnapshot(f.owner, await server.getSyncSnapshot(f.owner))
    const a = await store.createShelf(f.owner, 'Failed A'), b = await store.createShelf(f.owner, 'Keep B')
    const snapshot = await projected(f.owner)
    await store.saveObjectChanges(f.owner, f.object.id, snapshot.records[0], { inCollections: links.linkChoices(snapshot, 'inCollections'), title: 'Preserved title' })
    await db.insert(schema.collections).values({ id: a.mutation.id, ownerId: f.owner, name: 'Unrelated A', kind: 'shelf' })
    assert.equal((await syncArchive(f.owner, active)).status, 'rejected')
    const review = reviewShelfCreation(await store.listOperations(f.owner), a.operationId)
    await store.discardShelfCreation(f.owner, a.operationId, review.token)
    const pending = await store.listOperations(f.owner)
    assert.equal(pending[0].operationId, b.operationId)
    assert.deepEqual(pending[1].mutation.shelfDependencies, [{ id: b.mutation.id, operationId: b.operationId }])
    assert.deepEqual(pending[1].mutation.patch.changes.inCollections.map(ref => ref.id).sort(), [existing.id, b.mutation.id].sort())
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    const remote = await server.getSyncSnapshot(f.owner)
    assert.equal(remote.memberships.find(row => row.collectionId === existing.id).sortOrder, 19)
    assert.equal(remote.memberships.some(row => row.collectionId === b.mutation.id), true)
    assert.equal(remote.memberships.some(row => row.collectionId === a.mutation.id), false)
    const other = await setup(), creation = await store.createShelf(other.owner, 'Legacy')
    await store.recordResponse(other.owner, { operationId: creation.operationId, outcome: 'rejected' })
    await store.saveOperation(other.owner, { type: 'object.patch', patch: { id: other.object.id, baseRevision: 1, base: { inCollections: [] }, changes: { inCollections: [{ id: creation.mutation.id, name: 'Legacy' }] } } })
    const before = await store.readLibrary(other.owner), ambiguous = reviewShelfCreation(before.operations, creation.operationId)
    assert.equal(ambiguous.safe, false)
    await assert.rejects(store.discardShelfCreation(other.owner, creation.operationId, ambiguous.token), /Pending/)
    assert.deepEqual(await store.readLibrary(other.owner), before)
  }
  console.log('7 cancel one of two creators: remaining dependency, scalar values and existing membership position survive; ambiguous legacy provenance remains untouched')
  console.log('verify-pending-shelf-links: passed actual store/client/server, baseline server and synthetic PostgreSQL')
} finally { IDBObjectStore.prototype.add=originalAdd;await pool?.end();await admin.query(`drop database if exists ${database}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);await admin.end();rmSync(outdir,{recursive:true,force:true});console.log(`cleanup confirmed: ${database} absent`) }
