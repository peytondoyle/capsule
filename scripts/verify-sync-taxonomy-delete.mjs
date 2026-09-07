import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo, tmpdir } from 'node:os'
import vm from 'node:vm'
import { transformSync, buildSync } from 'esbuild'

const require = createRequire(import.meta.url), { Pool } = require('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const port = Number(process.env.CAPSULE_TEST_PG_PORT), host = process.env.CAPSULE_TEST_PG_SOCKET
assert.ok(port && host, 'An explicit local test port and socket are required')
assert.ok(host.startsWith('/'), 'Only a local Unix socket is allowed')
const connection = { host, port, user: userInfo().username }, admin = new Pool({ ...connection, database: 'postgres' }), database = `taxonomy_delete_${process.pid}`
let pool, checks = 0
const out = mkdtempSync(`${tmpdir()}/delete-roundtrip-`), originalFetch = globalThis.fetch
const json = value => JSON.parse(JSON.stringify(value))
function load(file, dependencies) {
  const loaded = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports, Date, require: name => { assert.ok(name in dependencies, name); return dependencies[name] } })
  return loaded.exports
}
async function check(name, run) { await run(); checks++; console.log(`✓ ${name}`) }
try {
  await admin.query(`create database ${database}`)
  console.log(`fixture database: ${database}`)
  pool = new Pool({ ...connection, database, application_name: 'capsule-W02-deletion' })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }), db = drizzle(pool, { schema })
  const deps = { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema }
  const links = load('src/lib/offline/links.ts', {})
  const deletion = load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': load('src/lib/offline/taxonomy.ts', {}) })
  const sync = load('src/server/sync.ts', { ...deps, '@/lib/offline/taxonomy': load('src/lib/offline/taxonomy.ts', {}), './objects': load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} }), '@/lib/offline/links': links, '@/lib/offline/taxonomy-delete': deletion, './sync-links': load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links }) })
  const tableFor = { person: schema.people, place: schema.places, occasion: schema.occasions }
  let serial = 0
  async function fixture(entity = 'person') {
    const owner = `delete-owner-${++serial}`; await db.insert(schema.users).values({ id: owner })
    const table = tableFor[entity]
    const [row] = await db.insert(table).values({ ownerId: owner, name: 'Entry', ...(entity === 'person' ? { note: 'Remember', initials: 'AB' } : entity === 'place' ? { lat: 48, lng: 2, kind: 'city' } : {}) }).returning()
    const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Keep object', story: 'Keep story', ...(entity === 'place' ? { placeId: row.id } : entity === 'occasion' ? { occasionId: row.id } : {}) }).returning()
    const [otherObject] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 2, title: 'Other object' }).returning()
    await db.insert(schema.objectFaces).values({ objectId: object.id, originalUrl: 'https://unused.invalid/original', cutoutUrl: 'https://unused.invalid/cutout' })
    if (entity === 'person') await db.insert(schema.objectPeople).values([{ objectId: object.id, personId: row.id, role: 'given_by' }, { objectId: object.id, personId: row.id, role: 'depicted' }])
    const snapshot = json(await sync.getSyncSnapshot(owner))
    const request = { operationId: crypto.randomUUID(), mutation: { type: 'taxonomy.delete', entity, id: row.id, baseRevision: 1, base: deletion.taxonomyDeletionBase(snapshot, entity, row.id) } }
    return { owner, row, table, object, otherObject, snapshot, request }
  }
  const apply = f => sync.applySyncMutation(f.owner, f.request)
  const exists = async f => (await db.select().from(f.table).where(orm.eq(f.table.id, f.row.id))).length === 1

  await check('all entities delete links atomically while preserving objects, other fields, and photographs', async () => {
    for (const entity of ['person', 'place', 'occasion']) {
      const f = await fixture(entity)
      assert.equal((await apply(f)).outcome, 'applied')
      assert.equal(await exists(f), false)
      const snapshot = json(await sync.getSyncSnapshot(f.owner))
      assert.equal(snapshot.records.length, 2); assert.equal(snapshot.records.find(row => row.id === f.object.id).story, 'Keep story')
      assert.deepEqual(snapshot.faces, f.snapshot.faces)
      assert.equal(snapshot.objectPeople.length, 0)
      if (entity !== 'person') assert.equal(snapshot.records.find(row => row.id === f.object.id)[entity === 'place' ? 'placeId' : 'occasionId'], null)
      assert.ok(snapshot.tombstones.some(row => row.entity === entity && row.id === f.row.id && row.revision === 2))
      assert.equal((await apply(f)).outcome, 'applied')
      assert.equal((await db.select().from(schema.syncOperations).where(orm.eq(schema.syncOperations.operationId, f.request.operationId))).length, 1)
    }
  })

  await check('foreign owner and malformed/incomplete baselines cannot delete', async () => {
    const f = await fixture(); await db.insert(schema.users).values({ id: 'foreign' })
    const response = await sync.applySyncMutation('foreign', f.request)
    assert.equal(response.outcome, 'conflict'); assert.equal(response.conflict.current, null); assert.equal(await exists(f), true)
    for (const base of [undefined, {}, { metadata: {}, links: [] }, { metadata: f.request.mutation.base.metadata, links: [] }]) {
      const result = await sync.applySyncMutation(f.owner, { operationId: crypto.randomUUID(), mutation: { ...f.request.mutation, base } })
      assert.notEqual(result.outcome, 'applied'); assert.equal(await exists(f), true)
    }
    assert.equal((await sync.applySyncMutation(f.owner, { operationId: crypto.randomUUID(), mutation: { ...f.request.mutation, entity: 'tag' } })).outcome, 'rejected')
  })

  await check('legacy metadata or relationship changes conflict even without a revision update', async () => {
    for (const entity of ['person', 'place', 'occasion']) {
      const f = await fixture(entity)
      await db.update(f.table).set(entity === 'person' ? { note: 'New note' } : entity === 'place' ? { lat: 49 } : { name: 'New occasion' }).where(orm.eq(f.table.id, f.row.id))
      assert.equal((await apply(f)).outcome, 'conflict'); assert.equal(await exists(f), true)
      const fresh = json(await sync.getSyncSnapshot(f.owner))
      f.request = { operationId: crypto.randomUUID(), mutation: { ...f.request.mutation, base: deletion.taxonomyDeletionBase(fresh, entity, f.row.id) } }
      if (entity === 'person') await db.insert(schema.objectPeople).values({ objectId: f.otherObject.id, personId: f.row.id, role: 'mentioned' })
      else await db.update(schema.objects).set(entity === 'place' ? { placeId: f.row.id } : { occasionId: f.row.id }).where(orm.eq(schema.objects.id, f.otherObject.id))
      assert.equal((await apply(f)).outcome, 'conflict'); assert.equal(await exists(f), true)
      const reviewed = json(await sync.getSyncSnapshot(f.owner))
      f.request = { operationId: crypto.randomUUID(), mutation: { ...f.request.mutation, base: deletion.taxonomyDeletionBase(reviewed, entity, f.row.id) } }
      assert.equal((await apply(f)).outcome, 'applied')
    }
  })

  await check('receipt insertion failure rolls back entry, relationships, and tombstone', async () => {
    const f = await fixture()
    await pool.query("create function reject_delete_receipt() returns trigger language plpgsql as $$ begin raise exception 'delete receipt rollback'; end $$")
    await pool.query('create trigger reject_delete_receipt before insert on sync_operations for each row execute function reject_delete_receipt()')
    await assert.rejects(() => apply(f), error => /delete receipt rollback/.test(String(error.cause?.message ?? error.message)))
    assert.equal(await exists(f), true)
    assert.deepEqual(json(await sync.getSyncSnapshot(f.owner)), f.snapshot)
    assert.equal((await db.select().from(schema.syncOperations).where(orm.eq(schema.syncOperations.operationId, f.request.operationId))).length, 0)
    await pool.query('drop trigger reject_delete_receipt on sync_operations'); await pool.query('drop function reject_delete_receipt()')
    assert.equal((await apply(f)).outcome, 'applied')
  })

  await check('deleted IDs cannot be recreated by a stale create-marked object link', async () => {
    for (const entity of ['person', 'place', 'occasion']) {
      const f = await fixture(entity); assert.equal((await apply(f)).outcome, 'applied')
      const field = entity === 'person' ? 'mentioned' : entity === 'place' ? 'atPlace' : 'onOccasion'
      const result = await sync.applySyncMutation(f.owner, { operationId: crypto.randomUUID(), mutation: { type: 'object.patch', patch: { id: f.otherObject.id, baseRevision: 1, base: { [field]: [] }, changes: { [field]: [{ id: f.row.id, name: f.row.name, create: true }] } } } })
      assert.equal(result.outcome, 'rejected'); assert.equal(await exists(f), false)
    }
  })

  await check('earlier queued relationship edits drain before deletion, including after explicit conflict resolution', async () => {
    const { indexedDB, IDBKeyRange } = require('fake-indexeddb')
    Object.assign(globalThis, { indexedDB, IDBKeyRange })
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
    for (const file of ['store', 'edits', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${file}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: `${out}/${file}.mjs` })
    const store = await import(`${out}/store.mjs`), edits = await import(`${out}/edits.mjs`), client = await import(`${out}/sync.mjs`)
    for (const competing of [false, true]) {
      const f = await fixture(); await store.replaceSnapshot(f.owner, f.snapshot)
      const before = edits.projectArchive(f.snapshot, []).records.find(row => row.id === f.otherObject.id)
      await store.saveObjectChanges(f.owner, before.id, before, { mentioned: [{ id: f.row.id, name: f.row.name }] })
      const projected = edits.projectArchive(f.snapshot, await store.listOperations(f.owner))
      await store.saveTaxonomyDeletion(f.owner, 'person', f.row.id, JSON.stringify(deletion.taxonomyDeletionBase(projected, 'person', f.row.id)))
      const requests = []
      globalThis.fetch = async (_url, init) => {
        assert.equal(init.headers['x-capsule-owner'], f.owner)
        if (init.method !== 'POST') return Response.json(await sync.getSyncSnapshot(f.owner))
        const request = JSON.parse(init.body); requests.push(request)
        return Response.json(await sync.applySyncMutation(f.owner, request))
      }
      if (competing) {
        const [otherPerson] = await db.insert(schema.people).values({ ownerId: f.owner, name: 'Remote person' }).returning()
        await db.insert(schema.objectPeople).values({ objectId: f.otherObject.id, personId: otherPerson.id, role: 'mentioned' })
        assert.equal((await client.syncArchive(f.owner, { isActiveOwner: () => true })).status, 'conflict')
        assert.equal(requests.length, 1); assert.equal(await exists(f), true)
        const local = await store.readLibrary(f.owner), review = edits.reviewObject(local.archive, local.operations, f.otherObject.id)
        await store.resolveObjectChanges(f.owner, f.otherObject.id, review.token, { mentioned: 'local' })
      }
      assert.equal((await client.syncArchive(f.owner, { isActiveOwner: () => true })).status, 'synced')
      assert.equal(requests.at(-1).mutation.type, 'taxonomy.delete')
      assert.equal(requests.at(-1).mutation.base.links.length, 3)
      assert.equal((await store.listOperations(f.owner)).length, 0)
      assert.equal(await exists(f), false)
      assert.equal((await store.readArchive(f.owner)).snapshot.records.length, 2)
    }
    globalThis.fetch = originalFetch
  })

  await check('racing FK reference inserts wait for deletion and fail instead of disappearing silently', async () => {
    const f = await fixture(), blocker = await pool.connect(), writer = await pool.connect(), updater = await pool.connect()
    let deleting, writing, updating
    try {
      await blocker.query('select pg_advisory_lock(720025)')
      await pool.query('create function pause_taxonomy_delete() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(720025); return OLD; end $$')
      await pool.query('create trigger pause_taxonomy_delete before delete on people for each row execute function pause_taxonomy_delete()')
      deleting = apply(f)
      let waiting = false
      for (let i = 0; i < 100; i++) {
        const { rows } = await blocker.query("select 1 from pg_stat_activity where datname = current_database() and wait_event = 'advisory' and query like '%delete from%' and pid <> pg_backend_pid()")
        if (rows.length) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(waiting, 'deletion reached the locked trigger')
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid
      writing = writer.query('insert into object_people(object_id, person_id, role) values ($1,$2,$3)', [f.otherObject.id, f.row.id, 'mentioned']).then(() => ({ applied: true }), error => ({ error }))
      let referenceWaiting = false
      for (let i = 0; i < 100; i++) {
        const { rows } = await blocker.query("select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'", [writerPid])
        if (rows.length) { referenceWaiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(referenceWaiting, 'new reference is blocked by the deletion row lock')
      const updaterPid = (await updater.query('select pg_backend_pid() as pid')).rows[0].pid
      updating = updater.query("update object_people set role='mentioned' where object_id=$1 and person_id=$2 and role='given_by'", [f.object.id, f.row.id])
      let updateWaiting = false
      for (let i = 0; i < 100; i++) {
        const { rows } = await blocker.query("select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'", [updaterPid])
        if (rows.length) { updateWaiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(updateWaiting, 'existing relationship changes are blocked until deletion commits')
      await blocker.query('select pg_advisory_unlock(720025)')
      assert.equal((await deleting).outcome, 'applied')
      const result = await writing
      assert.equal(result.error?.code, '23503')
      assert.equal((await updating).rowCount, 0)
      assert.equal((await pool.query('select 1 from object_people where person_id = $1', [f.row.id])).rows.length, 0)
    } finally {
      await blocker.query('select pg_advisory_unlock_all()')
      await Promise.allSettled([deleting, writing, updating].filter(Boolean))
      blocker.release(); writer.release(); updater.release()
      await pool.query('drop trigger if exists pause_taxonomy_delete on people'); await pool.query('drop function if exists pause_taxonomy_delete()')
    }
  })
  console.log(`verify-sync-taxonomy-delete: passed ${checks} real PostgreSQL scenarios; no Blob calls`)
} finally {
  globalThis.fetch = originalFetch; rmSync(out, { recursive: true, force: true })
  await pool?.end(); await admin.query(`drop database if exists ${database}`)
  assert.equal((await admin.query('select 1 from pg_database where datname = $1', [database])).rows.length, 0)
  console.log(`cleanup confirmed: ${database} absent`); await admin.end()
}
