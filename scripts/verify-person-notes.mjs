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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `person_notes_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-person-notes-`)
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
  for (const name of ['store', 'edits', 'taxonomy', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { reviewTaxonomyName, reviewPersonNote } = await import(`${outdir}/taxonomy.mjs`)
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
  async function setup(note = 'Old note') {
    const owner = `notes-${++serial}`
    await db.insert(schema.users).values({ id: owner })
    const [person] = await db.insert(schema.people).values({ ownerId: owner, name: 'Ada', note, initials: 'AB' }).returning()
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    return { owner, id: person.id }
  }
  const remotePerson = async owner => (await server.getSyncSnapshot(owner)).people[0]
  const reviewNote = async (owner, id) => { const library = await store.readLibrary(owner); return reviewPersonNote(library.archive, library.operations, id) }
  const reviewName = async (owner, id) => { const library = await store.readLibrary(owner); return reviewTaxonomyName(library.archive, library.operations, 'person', id) }
  {
    const { owner, id } = await setup(), first = await store.savePersonNote(owner, id, 'Old note', '  First\nline  ')
    const bytes = JSON.stringify(first), second = await store.savePersonNote(owner, id, '  First\nline  ', 'Second')
    assert.equal(JSON.stringify((await store.listOperations(owner))[0]), bytes)
    assert.equal(second.mutation.base.note, '  First\nline  ')
    assert.equal((await projected(owner)).people[0].note, 'Second')
    await assert.rejects(store.savePersonNote(owner, id, 'Old note', 'Stale'), /another tab/)
    await assert.rejects(store.savePersonNote(owner, id, 'Second', 'x'.repeat(20001)), /20,000/)
    await assert.rejects(store.savePersonNote('foreign', id, null, 'No'))
    await assert.rejects(store.saveTaxonomyDeletion(owner, 'person', id, ''), /saved changes/)
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.savePersonNote(owner, id, 'Second', 'Aborted'))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(owner), before)
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    assert.equal((await remotePerson(owner)).note, 'Second'); assert.equal((await remotePerson(owner)).initials, 'AB')
    await store.savePersonNote(owner, id, 'Second', ' \n ')
    assert.equal((await projected(owner)).people[0].note, null)
    assert.equal((await syncArchive(owner, active)).status, 'synced'); assert.equal((await remotePerson(owner)).note, null)
    assert.equal((await store.listOperations(owner)).length, 0)
  }
  console.log('1 save/repeated edits/clear, exact text, durability, owner/stale/limit guards and local rollback passed')
  {
    const { owner, id } = await setup()
    await store.savePersonNote(owner, id, 'Old note', 'Retry note'); lose = true; sent = []
    await assert.rejects(syncArchive(owner, active), /lost acknowledgement/)
    await store.savePersonNote(owner, id, 'Retry note', 'Later note')
    assert.equal((await syncArchive(owner, active)).status, 'synced'); assert.equal(sent[0], sent[1])
    assert.equal((await remotePerson(owner)).note, 'Later note')
    const receipt = await server.applySyncMutation(owner, JSON.parse(sent[0]))
    assert.equal(receipt.outcome, 'applied'); assert.equal((await remotePerson(owner)).note, 'Later note')
  }
  console.log('2 lost acknowledgement replays immutable request/receipt without overwriting later note')
  {
    const { owner, id } = await setup()
    await store.savePersonNote(owner, id, 'Old note', 'My note')
    await db.update(schema.people).set({ name: 'Remote name' }).where(orm.eq(schema.people.id, id))
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    assert.equal((await remotePerson(owner)).name, 'Remote name'); assert.equal((await remotePerson(owner)).note, 'My note')
    await store.saveTaxonomyName(owner, 'person', id, 'Remote name', 'My name')
    await db.update(schema.people).set({ note: 'Remote note' }).where(orm.eq(schema.people.id, id))
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    assert.equal((await remotePerson(owner)).name, 'My name'); assert.equal((await remotePerson(owner)).note, 'Remote note')
  }
  console.log('3 unrelated remote names/notes merge in both directions')
  for (const order of ['note-first', 'name-first']) {
    const { owner, id } = await setup()
    const note = await store.savePersonNote(owner, id, 'Old note', 'Local note')
    const name = await store.saveTaxonomyName(owner, 'person', id, 'Ada', 'Local name')
    await db.update(schema.people).set({ name: 'Remote name', note: 'Remote note' }).where(orm.eq(schema.people.id, id))
    // Retain both conflict receipts without a GET: exercises field-only resolution of older rows.
    for (const entry of [note, name]) await store.recordResponse(owner, await server.applySyncMutation(owner, entry))
    const originalName = await reviewName(owner, id), originalNote = await reviewNote(owner, id)
    assert.equal(originalName.edits.length, 1); assert.equal(originalNote.edits.length, 1)
    const keepNote = async () => { const review = await reviewNote(owner, id); await store.resolvePersonNote(owner, id, review.token, { discard: true }) }
    const keepName = async () => { const review = await reviewName(owner, id); await store.resolveTaxonomyName(owner, 'person', id, review.token, null) }
    if (order === 'note-first') { await keepNote(); assert.equal((await store.listOperations(owner))[0].operationId, name.operationId); await assert.rejects(store.saveTaxonomyDeletion(owner, 'person', id, ''), /saved changes/); await keepName() }
    else { await keepName(); assert.equal((await store.listOperations(owner))[0].operationId, note.operationId); await assert.rejects(store.saveTaxonomyDeletion(owner, 'person', id, ''), /saved changes/); await keepNote() }
    const row = (await projected(owner)).people[0]; assert.equal(row.name, 'Remote name'); assert.equal(row.note, 'Remote note')
    assert.equal((await store.listOperations(owner)).length, 0)
    await assert.rejects(store.resolvePersonNote(owner, id, originalNote.token, { note: 'Stale' }), /changed in another tab/)
  }
  {
    const { owner, id } = await setup()
    const note = await store.savePersonNote(owner, id, 'Old note', 'Local note')
    const name = await store.saveTaxonomyName(owner, 'person', id, 'Ada', 'Local name')
    const old = { ...await remotePerson(owner), name: 'Remote name', revision: 2 }
    await store.recordResponse(owner, { operationId: name.operationId, outcome: 'conflict', conflict: { entity: 'person', id, revision: 2, current: old, fields: ['name'] } })
    await store.recordResponse(owner, { operationId: note.operationId, outcome: 'conflict', conflict: { entity: 'person', id, revision: 3, current: { ...old, revision: 3, note: 'Newest note' }, fields: ['note'] } })
    const nr = await reviewNote(owner, id); await store.resolvePersonNote(owner, id, nr.token, { discard: true })
    const names = await reviewName(owner, id); assert.equal(names.remote.revision, 3)
    await store.resolveTaxonomyName(owner, 'person', id, names.token, null)
    assert.equal((await projected(owner)).people[0].note, 'Newest note')
  }
  console.log('4 independent name/note reviews preserve operations and metadata in both orders; stale reviews refused')
  {
    const { owner, id } = await setup()
    const original = await store.savePersonNote(owner, id, 'Old note', 'Local note')
    await db.update(schema.people).set({ note: 'Remote note' }).where(orm.eq(schema.people.id, id))
    assert.equal((await syncArchive(owner, active)).status, 'conflict')
    let review = await reviewNote(owner, id); assert.equal(review.local.note, 'Local note'); assert.equal(review.remote.note, 'Remote note')
    await assert.rejects(store.savePersonNote(owner, id, 'Local note', 'No'), /Review/)
    const before = await store.readLibrary(owner)
    IDBObjectStore.prototype.add = function (...args) { const request = originalAdd.apply(this, args); if (this.name === 'outbox') request.addEventListener('success', () => this.transaction.abort()); return request }
    await assert.rejects(store.resolvePersonNote(owner, id, review.token, { note: null }))
    IDBObjectStore.prototype.add = originalAdd; assert.deepEqual(await store.readLibrary(owner), before)
    await store.resolvePersonNote(owner, id, review.token, { note: null })
    assert.notEqual((await store.listOperations(owner))[0].operationId, original.operationId)
    assert.equal((await syncArchive(owner, active)).status, 'synced'); assert.equal((await remotePerson(owner)).note, null)
    const next = await store.savePersonNote(owner, id, null, 'Keep for export')
    await db.delete(schema.people).where(orm.eq(schema.people.id, id))
    assert.equal((await syncArchive(owner, active)).status, 'conflict'); review = await reviewNote(owner, id)
    assert.equal(review.remote, null); assert.equal(review.local.note, 'Keep for export')
    await assert.rejects(store.resolvePersonNote(owner, id, review.token, { note: 'Restore' }), /cannot be retried/)
    await store.resolvePersonNote(owner, id, review.token, { discard: true })
    assert.equal((await store.listOperations(owner)).length, 0); assert.equal((await projected(owner)).people.length, 0)
    assert.equal((await server.applySyncMutation(owner, next)).conflict.current, null)
  }
  console.log('5 conflict clear differs from discard; atomic resolution and removed-person recovery passed')
  {
    const { owner, id } = await setup(), entry = await store.savePersonNote(owner, id, 'Old note', 'Local note')
    const current = await remotePerson(owner)
    for (const change of [{ fields: ['name'] }, { current: { ...current, note: 42 } }, { current: { ...current, ownerId: 'foreign' } }, { revision: 0 }, { id: crypto.randomUUID() }]) {
      malformed = { outcome: 'conflict', conflict: { entity: 'person', id, revision: 1, current, fields: ['note'], ...change } }
      await assert.rejects(syncArchive(owner, active), /conflict details are incomplete/)
      assert.equal((await store.listOperations(owner))[0].response, undefined)
    }
    malformed = { outcome: 'rejected', reason: 'name_taken', conflict: { entity: 'person', id, revision: 1, current, fields: ['note'] } }
    await assert.rejects(syncArchive(owner, active), /conflict details are incomplete/); malformed = undefined
    const request = entry.mutation
    for (const mutation of [{ ...request, entity: 'place' }, { ...request, values: { name: 'Name', note: 'Note' } }, { ...request, base: {} }, { ...request, values: { note: 42 } }, { ...request, values: { note: 'x'.repeat(20001) } }]) assert.equal((await server.applySyncMutation(owner, { operationId: crypto.randomUUID(), mutation })).outcome, 'rejected')
    const other = (await setup()).owner
    assert.equal((await server.applySyncMutation(other, entry)).conflict.current, null)
  }
  console.log('6 malformed responses retained for retry; server rejects wrong fields/types/owners')
  {
    const { owner, id } = await setup('x'.repeat(20001))
    await store.savePersonNote(owner, id, 'x'.repeat(20001), 'Shortened')
    assert.equal((await syncArchive(owner, active)).status, 'synced')
    const snapshot = (await store.readArchive(owner)).snapshot
    const deletion = load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': taxonomy })
    await store.saveTaxonomyDeletion(owner, 'person', id, JSON.stringify(deletion.taxonomyDeletionBase(snapshot, 'person', id)))
    await assert.rejects(store.savePersonNote(owner, id, 'Shortened', 'No'), /Sync this person/)
    const local = await setup(), snap = (await store.readArchive(local.owner)).snapshot
    await store.replaceSnapshot(local.owner, { ...snap, people: [{ ...snap.people[0], localOnly: true }] })
    await assert.rejects(store.savePersonNote(local.owner, local.id, 'Old note', 'No'), /Sync this person/)
  }
  console.log('7 existing long notes can be shortened; pending deletion and local-only edits refused')
  {
    const { owner, id } = await setup(), entry = await store.savePersonNote(owner, id, 'Old note', 'Rolled back')
    await pool.query(`create function note_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'note receipt rollback'; end $$`)
    await pool.query(`create trigger note_receipt_rollback before insert on sync_operations for each row execute function note_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(owner, entry))
    assert.equal((await remotePerson(owner)).note, 'Old note'); assert.equal((await remotePerson(owner)).revision, 1)
    assert.equal((await pool.query('select 1 from sync_operations where owner_id=$1', [owner])).rowCount, 0)
    await pool.query('drop trigger note_receipt_rollback on sync_operations'); await pool.query('drop function note_receipt_rollback()')
    assert.equal((await syncArchive(owner, active)).status, 'synced')
  }
  console.log('8 server receipt failure rolls back note and revision; retry succeeds')
  console.log('verify-person-notes: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add = originalAdd; await pool?.end(); await admin.query(`drop database if exists ${database}`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [database])).rowCount, 0); await admin.end(); rmSync(outdir, { recursive: true, force: true }); console.log(`cleanup confirmed: ${database} absent`) }
