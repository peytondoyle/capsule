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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `pending_names_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-pending-names-`)
let pool
function load(file, dependencies) { const loaded = { exports: {} }; vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports, Date, require: name => { assert.ok(name in dependencies, name); return dependencies[name] } }); return loaded.exports }
const fields = { person: 'givenBy', place: 'atPlace', occasion: 'onOccasion' }, kinds = { person: 'people', place: 'places', occasion: 'occasions' }
const active = { isActiveOwner: () => true }
const originalAdd = IDBObjectStore.prototype.add
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(`drizzle/${name}.sql`, 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }), db = drizzle(pool, { schema })
  const links = load('src/lib/offline/links.ts', {}), taxonomy = load('src/lib/offline/taxonomy.ts', {})
  const deps = { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema }
  const server = load('src/server/sync.ts', { ...deps, './objects': load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} }), '@/lib/offline/links': links, '@/lib/offline/taxonomy-delete': load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': taxonomy }), './sync-links': load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links }) })
  for (const name of ['store', 'edits', 'taxonomy', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { reviewTaxonomyName } = await import(`${outdir}/taxonomy.mjs`)
  const projected = async owner => { const library = await store.readLibrary(owner); return projectArchive(library.archive.snapshot, library.operations) }
  let loseType, lost = false, sent = []
  globalThis.fetch = async (_url, init) => {
    const owner = init.headers['x-capsule-owner']
    if (init.method !== 'POST') return Response.json(await server.getSyncSnapshot(owner))
    const request = JSON.parse(init.body); sent.push({ owner, body: init.body, request })
    const response = await server.applySyncMutation(owner, request)
    if (request.mutation.type === loseType && !lost) { lost = true; throw new Error('lost acknowledgement') }
    return Response.json(response)
  }
  async function setup(owner, entity) {
    await db.insert(schema.users).values({ id: owner })
    const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Ticket' }).returning()
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    const id = crypto.randomUUID(), field = fields[entity], current = (await projected(owner)).records[0]
    const creator = await store.saveObjectChanges(owner, object.id, current, { [field]: [{ id, name: 'Local name', create: true }] })
    return { object, id, field, creator }
  }
  for (const entity of ['person', 'place', 'occasion']) {
    const owner = `ordered-${entity}`, { object, id, field, creator } = await setup(owner, entity)
    const bytes = JSON.stringify(creator)
    const first = await store.saveTaxonomyName(owner, entity, id, 'Local name', 'First name')
    const second = await store.saveTaxonomyName(owner, entity, id, 'First name', 'Final name')
    assert.notEqual(first.operationId, second.operationId); assert.equal(second.mutation.base.name, 'First name')
    assert.equal(JSON.stringify((await store.listOperations(owner))[0]), bytes)
    await assert.rejects(store.saveTaxonomyName(owner, entity, id, 'Local name', 'Stale'), /another tab/)
    await assert.rejects(store.saveTaxonomyName('foreign', entity, id, 'Final name', 'Intruder'))
    assert.equal((await projected(owner)).records[0][field][0].name, 'Final name')
    const [other] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 2, title: 'Second' }).returning()
    const snap = (await store.readArchive(owner)).snapshot
    await store.replaceSnapshot(owner, { ...snap, records: [...snap.records, { ...other, revision: 1 }] })
    await store.saveObjectChanges(owner, other.id, (await projected(owner)).records.find(row => row.id === other.id), { [field]: links.linkChoices(await projected(owner), field).filter(ref => ref.id === id) })
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.saveTaxonomyName(owner, entity, id, 'Final name', 'Aborted'))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(owner), before)
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    const remote = await server.getSyncSnapshot(owner)
    assert.equal(remote[kinds[entity]].find(row => row.id === id).name, 'Final name')
    assert.equal((await projected(owner)).records.find(row => row.id === object.id)[field][0].name, 'Final name')
    assert.equal((await projected(owner)).records.find(row => row.id === other.id)[field][0].name, 'Final name')
    assert.equal((await store.listOperations(owner)).length, 0)
  }
  console.log('1 three entities: ordered repeated renames, immutable creators, linked labels, stale/owner and rollback checks passed')

  for (const type of ['object.patch', 'taxonomy.upsert']) {
    const owner = `lost-${type}`, { id, creator } = await setup(owner, 'person')
    loseType = type; lost = false; sent = []
    if (type === 'taxonomy.upsert') await store.saveTaxonomyName(owner, 'person', id, 'Local name', 'After retry')
    await assert.rejects(syncArchive(owner, active), /lost acknowledgement/)
    if (type === 'object.patch') await store.saveTaxonomyName(owner, 'person', id, 'Local name', 'After retry')
    assert.equal((await store.listOperations(owner))[0].operationId, creator.operationId)
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    const retries = sent.filter(item => item.request.mutation.type === type)
    assert.equal(retries.length, 2); assert.equal(retries[0].body, retries[1].body)
    assert.equal((await server.getSyncSnapshot(owner)).people.find(row => row.id === id).name, 'After retry')
  }
  loseType = undefined
  console.log('2 lost creator or rename acknowledgement retries exact original request bytes')

  for (const entity of ['person', 'place', 'occasion']) {
    const owner = `alias-${entity}`, { id } = await setup(owner, entity)
    await store.saveTaxonomyName(owner, entity, id, 'Local name', 'My renamed entry')
    const [existing] = await db.insert(schema[kinds[entity]]).values({ ownerId: owner, name: 'Local name' }).returning()
    assert.equal((await syncArchive(owner, active)).status, 'conflict')
    const library = await store.readLibrary(owner), review = reviewTaxonomyName(library.archive, library.operations, entity, id)
    assert.equal(review.pending, true); assert.equal(review.remote, null); assert.equal(review.local.name, 'My renamed entry')
    const remote = await server.getSyncSnapshot(owner)
    assert.equal(remote[kinds[entity]].find(row => row.id === existing.id).name, 'Local name')
    assert.equal(remote[kinds[entity]].some(row => row.id === id), false)
    await assert.rejects(store.resolveTaxonomyName(owner, entity, id, review.token, 'Rename existing'), /deleted/)
    await store.resolveTaxonomyName(owner, entity, id, review.token, null)
    assert.equal((await store.listOperations(owner)).length, 0)
  }
  console.log('3 same-name alias mapping conflicts without renaming existing identities; recovery/discard stays available')

  const owner = 'creator-conflict', { object, id, creator } = await setup(owner, 'person')
  await store.saveTaxonomyName(owner, 'person', id, 'Local name', 'Queued rename')
  const [person] = await db.insert(schema.people).values({ ownerId: owner, name: 'Remote person' }).returning()
  await db.insert(schema.objectPeople).values({ objectId: object.id, personId: person.id, role: 'given_by' })
  sent = []; assert.equal((await syncArchive(owner, active)).status, 'conflict')
  assert.equal(sent.length, 1); assert.equal(sent[0].request.operationId, creator.operationId)
  assert.equal((await store.listOperations(owner)).length, 2)
  assert.equal((await server.getSyncSnapshot(owner)).people.some(row => row.id === id), false)
  console.log('4 conflicting creator stops dependent rename with local name preserved')
  console.log('verify-pending-taxonomy: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add = originalAdd; await pool?.end(); await admin.query(`drop database if exists ${database}`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [database])).rowCount, 0); await admin.end(); rmSync(outdir, { recursive: true, force: true }); console.log(`cleanup confirmed: ${database} absent`) }
