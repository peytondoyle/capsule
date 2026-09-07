// OFFLINE_RUNTIME resolves fake-indexeddb/pg; use the approved private local PostgreSQL socket.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo, tmpdir } from 'node:os'
import vm from 'node:vm'
import { buildSync, transformSync } from 'esbuild'
const require = createRequire(import.meta.url), runtime = createRequire(`${process.env.OFFLINE_RUNTIME}/package.json`)
const { Pool } = runtime('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const { indexedDB, IDBKeyRange, IDBObjectStore } = runtime('fake-indexeddb'); Object.assign(globalThis, { indexedDB, IDBKeyRange })
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const connection = { host: process.env.CAPSULE_TEST_PG_SOCKET, port: Number(process.env.CAPSULE_TEST_PG_PORT), user: userInfo().username }; assert.ok(connection.host && connection.port)
const admin = new Pool({ ...connection, database: 'postgres' }), database = `occasion_merges_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-occasion-merges-`)
let pool
function load(file, dependencies) { const loaded = { exports: {} }; vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports, Date, require: name => { assert.ok(name in dependencies, name); return dependencies[name] } }); return loaded.exports }
const active = { isActiveOwner: () => true }
const originalAdd = IDBObjectStore.prototype.add
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(`drizzle/${name}.sql`, 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }), db = drizzle(pool, { schema })
  const links = load('src/lib/offline/links.ts', {}), taxonomy = load('src/lib/offline/taxonomy.ts', {})
  const deps = { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema }
  const server = load('src/server/sync.ts', { ...deps, '@/lib/offline/taxonomy': load('src/lib/offline/taxonomy.ts', {}), './objects': load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} }), '@/lib/offline/links': links, '@/lib/offline/taxonomy-delete': load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': taxonomy }), './sync-links': load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links }) })
  for (const name of ['store', 'edits', 'taxonomy-merge', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { occasionMergeBase, reviewOccasionMerge } = await import(`${outdir}/taxonomy-merge.mjs`)
  const projected = async owner => { const library = await store.readLibrary(owner); return projectArchive(library.archive.snapshot, library.operations) }
  let serial = 0, lose = false, sent = [], malformed
  globalThis.fetch = async (_url, init) => {
    const owner = init.headers['x-capsule-owner']
    if (init.method !== 'POST') return Response.json(await server.getSyncSnapshot(owner))
    const request = JSON.parse(init.body); sent.push(init.body)
    const response = malformed ?? await server.applySyncMutation(owner, request)
    if (lose) { lose = false; throw new Error('lost acknowledgement') }
    return Response.json(malformed ? { ...response, operationId: request.operationId } : response)
  }
  async function setup() {
    const owner = `merge-${++serial}`
    await db.insert(schema.users).values({ id: owner })
    const [source, target] = await db.insert(schema.occasions).values([{ ownerId: owner, name: 'Birthday alias' }, { ownerId: owner, name: 'Birthday' }]).returning()
    const [object, other] = await db.insert(schema.objects).values([{ ownerId: owner, lotNo: 1, title: 'Card', story: 'Keep story', occasionId: source.id }, { ownerId: owner, lotNo: 2, title: 'Pin', occasionId: target.id }]).returning()
    await db.insert(schema.objectFaces).values({ objectId: object.id, originalUrl: 'https://unused.invalid/original', cutoutUrl: 'https://unused.invalid/cutout' })
    const alias = crypto.randomUUID()
    await db.insert(schema.syncClientIds).values({ ownerId: owner, entity: 'occasion', clientId: alias, serverId: source.id })
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    return { owner, id: source.id, targetId: target.id, object, other, alias }
  }
  const baseFor = (snapshot, id, targetId) => ({ source: occasionMergeBase(snapshot, id), target: occasionMergeBase(snapshot, targetId) })
  const save = async f => store.saveOccasionMerge(f.owner, f.id, f.targetId, JSON.stringify(baseFor(await projected(f.owner), f.id, f.targetId)))
  const review = async (owner, operationId) => { const library = await store.readLibrary(owner); return reviewOccasionMerge(library.archive, library.operations, operationId) }
  {
    const f = await setup(), { owner, id, targetId, object, other, alias } = f, before = await server.getSyncSnapshot(owner), entry = await save(f)
    const local = await projected(owner)
    assert.equal(local.occasions.some(row => row.id === id), false)
    assert.equal(local.records.find(row => row.id === object.id).onOccasion[0].name, 'Birthday')
    assert.equal(local.records.find(row => row.id === other.id).occasionId, targetId)
    await assert.rejects(store.saveTaxonomyName(owner, 'occasion', targetId, 'Birthday', 'No'), /saved merge/)
    await assert.rejects(store.saveTaxonomyDeletion(owner, 'occasion', targetId, ''), /saved merge/)
    await assert.rejects(store.saveObjectChanges(owner, object.id, local.records[0], { onOccasion: [{ id, name: 'Birthday alias', create: true }] }), /being merged/)
    await assert.rejects(store.saveObjectChanges(owner, object.id, local.records[0], { occasionId: id }), /Choose/)
    await store.saveObjectChanges(owner, object.id, local.records.find(row => row.id === object.id), { story: 'Later story' })
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    const after = await server.getSyncSnapshot(owner)
    assert.equal(after.occasions.length, 1); assert.equal(after.occasions[0].id, targetId)
    assert.equal(after.occasions[0].name, 'Birthday'); assert.equal(JSON.stringify(after.occasions[0].createdAt), JSON.stringify(before.occasions.find(row => row.id === targetId).createdAt))
    assert.equal(after.records.find(row => row.id === object.id).occasionId, targetId); assert.equal(after.records.find(row => row.id === object.id).story, 'Later story')
    assert.equal(after.records.find(row => row.id === object.id).revision, 3); assert.equal(after.records.find(row => row.id === other.id).revision, 1)
    assert.equal(after.occasions[0].revision, 2); assert.ok(after.tombstones.some(row => row.id === id && row.revision === 2))
    assert.equal(JSON.stringify(after.faces), JSON.stringify(before.faces))
    assert.equal((await db.select().from(schema.syncClientIds).where(orm.eq(schema.syncClientIds.clientId, alias)))[0].serverId, id)
    assert.equal((await server.applySyncMutation(owner, entry)).outcome, 'applied'); assert.equal((await store.listOperations(owner)).length, 0)
    for (const staleId of [id, alias]) {
      const response = await server.applySyncMutation(owner, { operationId: crypto.randomUUID(), mutation: { type: 'object.patch', patch: { id: object.id, baseRevision: 3, base: { onOccasion: [{ id: targetId, name: 'Birthday' }] }, changes: { onOccasion: [{ id: staleId, name: 'Birthday alias', create: true }] } } } })
      assert.equal(response.outcome, 'rejected')
    }
    assert.equal((await server.getSyncSnapshot(owner)).occasions.length, 1)
  }
  console.log('1 durable projection, reference guards, later edits, atomic move, revisions, unchanged media/target metadata and stale aliases passed')
  {
    const f = await setup(), entry = await save(f); sent = []; lose = true
    await assert.rejects(syncArchive(f.owner, active), /lost acknowledgement/)
    assert.equal((await store.listOperations(f.owner))[0].operationId, entry.operationId)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced'); assert.equal(sent[0], sent[1])
    assert.equal((await server.getSyncSnapshot(f.owner)).occasions.length, 1)
  }
  console.log('2 lost merge acknowledgement retries exact immutable operation')
  for (const side of ['source-name', 'target-name', 'source-links', 'target-links']) {
    const f = await setup(), entry = await save(f), key = side.startsWith('source') ? f.id : f.targetId
    if (side.endsWith('name')) await db.update(schema.occasions).set({ name: 'Changed elsewhere' }).where(orm.eq(schema.occasions.id, key))
    else await db.insert(schema.objects).values({ ownerId: f.owner, lotNo: 3, title: 'New link', occasionId: key })
    assert.equal((await syncArchive(f.owner, active)).status, 'conflict')
    const current = await review(f.owner, entry.operationId); assert.equal(current.refreshed, true)
    assert.equal((await server.getSyncSnapshot(f.owner)).occasions.length, 2)
    const before = await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.resolveOccasionMerge(f.owner, entry.operationId, current.token, true))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(f.owner), before)
    await store.resolveOccasionMerge(f.owner, entry.operationId, current.token, true)
    assert.notEqual((await store.listOperations(f.owner))[0].operationId, entry.operationId)
    await assert.rejects(store.resolveOccasionMerge(f.owner, entry.operationId, current.token, true), /changed in another tab/)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    assert.equal((await server.getSyncSnapshot(f.owner)).occasions.length, 1)
  }
  console.log('3 both metadata/link baselines detect changes; fresh retry, stale-review and atomic local rollback passed')
  {
    const f = await setup(), expected = JSON.stringify(baseFor(await projected(f.owner), f.id, f.targetId))
    await assert.rejects(store.saveOccasionMerge(f.owner, f.id, f.id, expected), /different destination/)
    await assert.rejects(store.saveOccasionMerge('foreign', f.id, f.targetId, expected))
    await store.saveTaxonomyName(f.owner, 'occasion', f.id, 'Birthday alias', 'New name')
    await assert.rejects(save(f), /saved changes/)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    await assert.rejects(store.saveOccasionMerge(f.owner, f.id, f.targetId, expected), /another tab/)
    const before = await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(save(f)); IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(f.owner), before)
    const snapshot = (await store.readArchive(f.owner)).snapshot
    await store.replaceSnapshot(f.owner, { ...snapshot, occasions: snapshot.occasions.map(row => row.id === f.targetId ? { ...row, localOnly: true } : row) })
    await assert.rejects(save(f), /already saved/)
  }
  console.log('4 stale saves, pending rename, same identity, foreign/local-only entries and save rollback refused')
  for (const missing of ['source', 'target']) {
    const f = await setup(), entry = await save(f)
    await db.delete(schema.occasions).where(orm.eq(schema.occasions.id, missing === 'source' ? f.id : f.targetId))
    await store.recordResponse(f.owner, await server.applySyncMutation(f.owner, entry))
    let current = await review(f.owner, entry.operationId); assert.equal(current.refreshed, false)
    await assert.rejects(store.resolveOccasionMerge(f.owner, entry.operationId, current.token, false), /refresh both/)
    assert.equal((await syncArchive(f.owner, active)).status, 'conflict'); current = await review(f.owner, entry.operationId)
    assert.equal(current[missing], null)
    await assert.rejects(store.resolveOccasionMerge(f.owner, entry.operationId, current.token, true), /cannot be retried/)
    assert.equal(entry.mutation.base.source.metadata.name, 'Birthday alias'); assert.equal(entry.mutation.base.target.metadata.name, 'Birthday')
    await store.resolveOccasionMerge(f.owner, entry.operationId, current.token, false)
    assert.equal((await store.listOperations(f.owner)).length, 0)
  }
  console.log('5 removed source/target retain recovery payload; refresh required and recreation refused')
  {
    const f = await setup(), entry = await save(f), snapshot = await server.getSyncSnapshot(f.owner), source = snapshot.occasions.find(row => row.id === f.id)
    for (const fields of [['name'], ['source','links']]) {
      malformed = { outcome: 'conflict', conflict: { entity: 'occasion', id: f.id, revision: 1, current: source, fields } }
      await assert.rejects(syncArchive(f.owner, active), /merge conflict details/); assert.equal((await store.listOperations(f.owner))[0].response, undefined)
    }
    malformed = { outcome: 'conflict', conflict: { entity: 'occasion', id: f.id, revision: 1, current: { ...source, ownerId: 'foreign' }, fields: ['source','target','links'] } }
    await assert.rejects(syncArchive(f.owner, active), /merge conflict details/); malformed = undefined
    const other = await setup(); assert.equal((await server.applySyncMutation(other.owner, entry)).conflict.current, null)
    for (const mutation of [{ ...entry.mutation, targetId: f.id }, { ...entry.mutation, base: {} }, { ...entry.mutation, base: { ...entry.mutation.base, source: { ...entry.mutation.base.source, links: [42] } } }]) assert.equal((await server.applySyncMutation(f.owner, { operationId: crypto.randomUUID(), mutation })).outcome, 'rejected')
    const rejected = { operationId: entry.operationId, outcome: 'rejected' }; await store.recordResponse(f.owner, rejected); await store.replaceSnapshot(f.owner, snapshot)
    const current = await review(f.owner, entry.operationId); await assert.rejects(store.resolveOccasionMerge(f.owner, entry.operationId, current.token, true), /cannot be retried/)
    await store.resolveOccasionMerge(f.owner, entry.operationId, current.token, false)
  }
  console.log('6 owner validation, malformed response retention, input rejection and rejected merge recovery passed')
  {
    const f = await setup(), entry = await save(f), before = JSON.stringify(await server.getSyncSnapshot(f.owner))
    await pool.query(`create function merge_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'merge receipt rollback'; end $$`)
    await pool.query(`create trigger merge_receipt_rollback before insert on sync_operations for each row execute function merge_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner, entry))
    assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)), before)
    assert.equal((await pool.query('select 1 from sync_operations where owner_id=$1',[f.owner])).rowCount, 0)
    await pool.query('drop trigger merge_receipt_rollback on sync_operations'); await pool.query('drop function merge_receipt_rollback()')
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
  }
  console.log('7 failed receipt rolls back reference moves, source deletion and all revisions')
  {
    const f = await setup(), entry = await save(f), writer = await pool.connect()
    try {
      await writer.query('begin')
      await writer.query('insert into objects (owner_id,lot_no,title,occasion_id) values ($1,3,$2,$3)', [f.owner,'Concurrent link',f.id])
      let settled = false
      const merging = server.applySyncMutation(f.owner, entry).finally(() => { settled = true })
      await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(settled, false)
      await writer.query('commit')
      assert.equal((await merging).outcome, 'conflict')
      assert.equal((await server.getSyncSnapshot(f.owner)).occasions.length, 2)
    } finally { await writer.query('rollback'); writer.release() }
  }
  console.log('8 concurrent source link commit is serialized and detected before merge')
  console.log('verify-occasion-merges: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add = originalAdd; await pool?.end(); await admin.query(`drop database if exists ${database}`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [database])).rowCount, 0); await admin.end(); rmSync(outdir, { recursive: true, force: true }); console.log(`cleanup confirmed: ${database} absent`) }
