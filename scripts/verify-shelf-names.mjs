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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `shelf_names_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-shelf-names-`)
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
  const server = load('src/server/sync.ts', { ...deps, '@/lib/offline/shelves': load('src/lib/offline/shelves.ts', {}), '@/lib/offline/taxonomy': load('src/lib/offline/taxonomy.ts', {}), './objects': load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} }), '@/lib/offline/links': links, '@/lib/offline/taxonomy-delete': load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': taxonomy }), './sync-links': load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links }) })
  for (const name of ['store', 'edits', 'shelves', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { reviewShelfName } = await import(`${outdir}/shelves.mjs`)
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
  async function setup(kind = 'shelf') {
    const owner = `shelf-${++serial}`
    await db.insert(schema.users).values({ id: owner })
    const [shelf] = await db.insert(schema.collections).values({ ownerId: owner, name: 'Keepsakes', kind, rule: { keep: true }, boardX: 12, boardY: 34, boardW: 56, boardH: 78, impliedTags: ['keep'], sortOrder: 7 }).returning()
    const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Card' }).returning()
    await db.insert(schema.collectionObjects).values({ objectId: object.id, collectionId: shelf.id, sortOrder: 9 })
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    return { owner, id: shelf.id, object }
  }
  const remoteShelf = async f => (await server.getSyncSnapshot(f.owner)).collections.find(row => row.id === f.id)
  const review = async f => { const library = await store.readLibrary(f.owner); return reviewShelfName(library.archive, library.operations, f.id) }
  const request = (f, name = 'New name') => ({ operationId: crypto.randomUUID(), mutation: { type: 'collection.upsert', id: f.id, baseRevision: 1, base: { name: 'Keepsakes' }, values: { name } } })
  {
    const f = await setup(), before = await server.getSyncSnapshot(f.owner)
    await db.insert(schema.collections).values({ ownerId: f.owner, name: 'Duplicate', kind: 'shelf' })
    const first = await store.saveShelfName(f.owner, f.id, 'Keepsakes', ' First '), bytes = JSON.stringify(first)
    const second = await store.saveShelfName(f.owner, f.id, 'First', 'Duplicate')
    assert.equal(second.mutation.base.name, 'First'); assert.equal(JSON.stringify((await store.listOperations(f.owner))[0]), bytes)
    assert.equal((await projected(f.owner)).records[0].inCollections[0].name, 'Duplicate')
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Stale'), /another tab/)
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Duplicate', '  '), /Enter a name/)
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Duplicate', 'x'.repeat(251)), /Enter a name/)
    const local = await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Duplicate', 'Aborted'))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(f.owner), local)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    const after = await server.getSyncSnapshot(f.owner), row = await remoteShelf(f)
    assert.equal(after.collections.filter(row => row.name === 'Duplicate').length, 2)
    assert.equal(row.revision, 3)
    for (const key of ['kind','rule','boardX','boardY','boardW','boardH','impliedTags','sortOrder','createdAt']) assert.equal(JSON.stringify(row[key]), JSON.stringify(before.collections[0][key]))
    assert.equal(JSON.stringify(after.memberships), JSON.stringify(before.memberships))
    assert.equal(JSON.stringify(after.records), JSON.stringify(before.records))
    assert.equal((await projected(f.owner)).records[0].inCollections[0].name, 'Duplicate')
    assert.equal((await store.listOperations(f.owner)).length, 0)
  }
  console.log('1 repeated immutable names, duplicates, linked labels, stale/empty/length/rollback and metadata/membership preservation passed')
  {
    const f = await setup(); await store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Retry name'); lose = true; sent = []
    await assert.rejects(syncArchive(f.owner, active), /lost acknowledgement/)
    await store.saveShelfName(f.owner, f.id, 'Retry name', 'Later name')
    assert.equal((await syncArchive(f.owner, active)).status, 'synced'); assert.equal(sent[0], sent[1])
    assert.equal((await remoteShelf(f)).name, 'Later name')
    assert.equal((await server.applySyncMutation(f.owner, JSON.parse(sent[0]))).outcome, 'applied'); assert.equal((await remoteShelf(f)).name, 'Later name')
  }
  console.log('2 lost acknowledgement retries exact request and old receipt does not overwrite later rename')
  {
    const f = await setup(); await store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Local name')
    await db.update(schema.collections).set({ sortOrder: 23, rule: { changed: true } }).where(orm.eq(schema.collections.id, f.id))
    assert.equal((await syncArchive(f.owner, active)).status, 'synced'); assert.equal((await remoteShelf(f)).sortOrder, 23)
    const first = await store.saveShelfName(f.owner, f.id, 'Local name', 'Conflict name')
    await store.saveShelfName(f.owner, f.id, 'Conflict name', 'Final local name')
    await db.update(schema.collections).set({ name: 'Remote name' }).where(orm.eq(schema.collections.id, f.id))
    assert.equal((await syncArchive(f.owner, active)).status, 'conflict')
    let current = await review(f); assert.equal(current.local.name, 'Final local name'); assert.equal(current.remote.name, 'Remote name')
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Final local name', 'No'), /Review/)
    const before = await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.resolveShelfName(f.owner, f.id, current.token, 'My choice'))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(f.owner), before)
    await store.resolveShelfName(f.owner, f.id, current.token, 'My choice')
    assert.notEqual((await store.listOperations(f.owner))[0].operationId, first.operationId)
    await assert.rejects(store.resolveShelfName(f.owner, f.id, current.token, null), /changed in another tab/)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced'); assert.equal((await remoteShelf(f)).name, 'My choice')
    assert.equal((await remoteShelf(f)).sortOrder, 23)
  }
  console.log('3 unrelated metadata merges; name conflict preserves final text and resolves atomically with fresh operation')
  for (const kind of ['smart','cluster','removed']) {
    const f = await setup(); await store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Keep for export')
    if (kind === 'removed') await db.delete(schema.collections).where(orm.eq(schema.collections.id, f.id))
    else await db.update(schema.collections).set({ kind }).where(orm.eq(schema.collections.id, f.id))
    assert.equal((await syncArchive(f.owner, active)).status, kind === 'removed' ? 'conflict' : 'rejected')
    const current = await review(f); assert.equal(current.local.name, 'Keep for export')
    await assert.rejects(store.resolveShelfName(f.owner, f.id, current.token, 'Restore'), /cannot be renamed/)
    await store.resolveShelfName(f.owner, f.id, current.token, null)
    assert.equal((await store.listOperations(f.owner)).length, 0)
    if (kind !== 'removed') assert.equal((await remoteShelf(f)).name, 'Keepsakes')
  }
  console.log('4 non-shelf/removed recovery preserves local name and refuses restore before discard')
  {
    const f = await setup(), foreign = await setup()
    await assert.rejects(store.saveShelfName(foreign.owner, f.id, 'Keepsakes', 'No'), /already saved/)
    assert.equal((await server.applySyncMutation(foreign.owner, request(f))).conflict.current, null)
    for (const kind of ['smart','cluster']) {
      const other = await setup(kind)
      await assert.rejects(store.saveShelfName(other.owner, other.id, 'Keepsakes', 'No'), /already saved/)
      assert.equal((await server.applySyncMutation(other.owner, request(other))).outcome, 'rejected')
    }
    for (const id of ['loose','unattributed']) assert.equal((await server.applySyncMutation(f.owner, request({ ...f, id }))).outcome, 'rejected')
    const snap = (await store.readArchive(f.owner)).snapshot
    await store.replaceSnapshot(f.owner, { ...snap, collections: snap.collections.map(row => ({ ...row, localOnly: true })) })
    await assert.rejects(store.saveShelfName(f.owner, f.id, 'Keepsakes', 'No'), /already saved/)
    for (const mutation of [{ ...request(f).mutation, values: { name: 'Name', sortOrder: 2 } }, { ...request(f).mutation, base: {} }, { ...request(f).mutation, values: { name: '' } }]) assert.equal((await server.applySyncMutation(f.owner, { operationId: crypto.randomUUID(), mutation })).outcome, 'rejected')
  }
  console.log('5 owner, local-only, virtual, smart/cluster and unexpected-field guards passed')
  {
    const f = await setup(); await store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Local')
    const row = await remoteShelf(f)
    for (const change of [{ entity: 'person' }, { fields: ['note'] }, { current: { ...row, kind: 'unknown' } }, { current: { ...row, ownerId: 'foreign' } }, { revision: 0 }]) {
      malformed = { outcome: 'conflict', conflict: { entity: 'collection', id: f.id, revision: 1, current: row, fields: ['name'], ...change } }
      await assert.rejects(syncArchive(f.owner, active), /shelf conflict details/)
      assert.equal((await store.listOperations(f.owner))[0].response, undefined)
    }
    malformed = undefined
    await db.update(schema.collections).set({ name: 'Remote' }).where(orm.eq(schema.collections.id, f.id))
    assert.equal((await syncArchive(f.owner, active)).status, 'conflict')
    const current = await review(f); await store.resolveShelfName(f.owner, f.id, current.token, null)
    assert.equal((await projected(f.owner)).records[0].inCollections[0].name, 'Remote')
  }
  console.log('6 malformed responses retain pending work; keeping archive name updates canonical labels')
  {
    const f = await setup(), entry = await store.saveShelfName(f.owner, f.id, 'Keepsakes', 'Rolled back')
    await pool.query(`create function shelf_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'shelf receipt rollback'; end $$`)
    await pool.query(`create trigger shelf_receipt_rollback before insert on sync_operations for each row execute function shelf_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner, entry))
    assert.equal((await remoteShelf(f)).name, 'Keepsakes'); assert.equal((await remoteShelf(f)).revision, 1)
    assert.equal((await pool.query('select 1 from sync_operations where owner_id=$1', [f.owner])).rowCount, 0)
    await pool.query('drop trigger shelf_receipt_rollback on sync_operations'); await pool.query('drop function shelf_receipt_rollback()')
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
  }
  console.log('7 failed receipt rolls back shelf name/revision and retry succeeds')
  console.log('verify-shelf-names: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add = originalAdd; await pool?.end(); await admin.query(`drop database if exists ${database}`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [database])).rowCount, 0); await admin.end(); rmSync(outdir, { recursive: true, force: true }); console.log(`cleanup confirmed: ${database} absent`) }
