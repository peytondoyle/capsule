import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { Pool } = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const orm = require('drizzle-orm')
const port = Number(process.env.CAPSULE_TEST_PG_PORT)
assert.ok(port, 'CAPSULE_TEST_PG_PORT is required')
const connection = { host: process.env.CAPSULE_TEST_PG_SOCKET ?? '/private/tmp', port, user: userInfo().username }
const admin = new Pool({ ...connection, database: 'postgres' })
const database = `capsule_sync_${process.pid}`
let pool

function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module: sandboxModule, exports: sandboxModule.exports, Date,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name] },
  })
  return sandboxModule.exports
}

try {
  await admin.query(`create database ${database}`)
  pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') })
  const db = drizzle(pool, { schema })
  const deps = { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema }
  const objects = load('src/server/objects.ts', { ...deps, './people': {}, './taxonomy': {} })
  const links = load('src/lib/offline/links.ts', {})
  const syncLinks = load('src/server/sync-links.ts', { ...deps, '@/lib/offline/links': links })
  const deletion = load('src/lib/offline/taxonomy-delete.ts', { './taxonomy': load('src/lib/offline/taxonomy.ts', {}) })
  const sync = load('src/server/sync.ts', { ...deps, './objects': objects, '@/lib/offline/links': links, './sync-links': syncLinks, '@/lib/offline/taxonomy-delete': deletion })
  const owner = 'sync-owner', other = 'sync-other'
  await db.insert(schema.users).values([{ id: owner }, { id: other }])
  const clientA = randomUUID()
  const create = (operationId, clientId = clientA) => sync.applySyncMutation(owner, { operationId, mutation: { type: 'object.create', clientId, values: { title: 'Ticket' } } })
  const [one, two] = await Promise.all([create('op-1'), create('op-1')])
  assert.equal((await db.select().from(schema.objects)).length, 1)
  assert.equal(one.mapping.id, two.mapping.id)
  const three = await create('op-2')
  assert.equal(three.mapping.id, one.mapping.id)
  const concurrentClient = randomUUID()
  const [sameClientOne, sameClientTwo] = await Promise.all([create('op-client-1', concurrentClient), create('op-client-2', concurrentClient)])
  assert.equal(sameClientOne.mapping.id, sameClientTwo.mapping.id)
  assert.equal((await db.select().from(schema.objects)).length, 2)
  const id = one.mapping.id
  await db.update(schema.objects).set({ title: 'Legacy' }).where(orm.eq(schema.objects.id, id))
  const conflict = await sync.applySyncMutation(owner, { operationId: 'op-3', mutation: { type: 'object.patch', patch: { id, baseRevision: 1, base: { title: 'Ticket' }, changes: { title: 'Local' } } } })
  assert.equal(conflict.outcome, 'conflict')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-3', mutation: { type: 'object.patch', patch: { id, baseRevision: 1, base: { title: 'Ticket' }, changes: { title: 'Local' } } } })).outcome, 'conflict')
  const merge = await sync.applySyncMutation(owner, { operationId: 'op-4', mutation: { type: 'object.patch', patch: { id, baseRevision: 1, base: { story: null }, changes: { story: 'Kept' } } } })
  assert.equal(merge.outcome, 'applied')
  for (const [operationId, base, title] of [['edit-first', 'Legacy', 'Local first'], ['edit-next', 'Local first', 'Local final']]) {
    assert.equal((await sync.applySyncMutation(owner, { operationId, mutation: { type: 'object.patch', patch: { id, baseRevision: 1, base: { title: base }, changes: { title } } } })).outcome, 'applied')
  }
  const reviewed = await sync.applySyncMutation(owner, { operationId: 'edit-conflict', mutation: { type: 'object.patch', patch: { id, baseRevision: 1, base: { title: 'Legacy' }, changes: { title: 'My choice' } } } })
  assert.equal(reviewed.outcome, 'conflict')
  assert.equal(reviewed.conflict.current.title, 'Local final')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'edit-resolution', mutation: { type: 'object.patch', patch: { id, baseRevision: reviewed.conflict.revision, base: { title: reviewed.conflict.current.title }, changes: { title: 'My choice' } } } })).outcome, 'applied')
  assert.equal((await db.select().from(schema.objects).where(orm.eq(schema.objects.id, id)))[0].story, 'Kept')
  const staleDelete = await sync.applySyncMutation(owner, { operationId: 'op-5', mutation: { type: 'object.delete', id, baseRevision: 1, base: { title: 'Ticket' } } })
  assert.equal(staleDelete.outcome, 'conflict')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-6', mutation: { type: 'object.create', clientId: randomUUID(), values: { title: 'Bad', placeId: id } } })).outcome, 'rejected')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-7', mutation: { type: 'object.create', clientId: randomUUID(), values: { title: 1 } } })).outcome, 'rejected')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-8', mutation: { type: 'face.delete', id, baseRevision: 1 } })).outcome, 'rejected')
  const [person] = await db.insert(schema.people).values({ ownerId: owner, name: 'Ada' }).returning()
  const [tag] = await db.insert(schema.tags).values({ ownerId: owner, name: 'Paper' }).returning()
  const [otherPlace] = await db.insert(schema.places).values({ ownerId: other, name: 'Elsewhere' }).returning()
  const [batch] = await db.insert(schema.intakeBatches).values({ ownerId: owner }).returning()
  await db.insert(schema.objectPeople).values({ objectId: id, personId: person.id, role: 'given_by' })
  await db.insert(schema.objectTags).values({ objectId: id, tagId: tag.id })
  await db.insert(schema.intakeItems).values({ batchId: batch.id, status: 'uploaded' })
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-9', mutation: { type: 'object.create', clientId: randomUUID(), values: { title: 'Nope', placeId: otherPlace.id } } })).outcome, 'rejected')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-10', mutation: { type: 'object.patch', patch: { id, baseRevision: 2, base: { placeId: null }, changes: { placeId: otherPlace.id } } } })).outcome, 'rejected')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'op-11', mutation: { type: 'object.patch', patch: { id, baseRevision: 2, base: { madeUp: null }, changes: { madeUp: 'no' } } } })).outcome, 'rejected')
  for (const [index, values] of [
    { title: '', rotationDeg: 'bad' },
    { title: 'Bad enum', retention: 'lost' },
    { title: 'Bad date', receivedAt: 'not-a-date' },
    { title: 'Bad uuid', placeId: 'not-a-uuid' },
  ].entries()) {
    assert.equal((await sync.applySyncMutation(owner, { operationId: `invalid-${index}`, mutation: { type: 'object.create', clientId: randomUUID(), values } })).outcome, 'rejected')
  }
  const validDelete = await create('delete-create', randomUUID())
  const [deleteRow] = await db.select().from(schema.objects).where(orm.eq(schema.objects.id, validDelete.mapping.id))
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'delete-empty-base', mutation: { type: 'object.delete', id: deleteRow.id, baseRevision: 1, base: {} } })).outcome, 'conflict')
  assert.equal((await sync.applySyncMutation(owner, { operationId: 'delete-full-base', mutation: { type: 'object.delete', id: deleteRow.id, baseRevision: 1, base: deleteRow } })).outcome, 'applied')
  const snapshot = await sync.getSyncSnapshot(owner)
  assert.equal(snapshot.ownerId, owner)
  assert.equal(snapshot.objectPeople.length, 1); assert.equal(snapshot.objectTags.length, 1); assert.equal(snapshot.pendingIntake.length, 1)
  assert.equal((await sync.getSyncSnapshot(other)).records.length, 0)
  const organized = await create('organize-create', randomUUID())
  const organizedId = organized.mapping.id
  const adaAlias = {id:randomUUID(),name:'ADA',create:true}, newTag = {id:randomUUID(),name:'Road trip',create:true}, newShelf = {id:randomUUID(),name:'My shelf',create:true}
  const editLinks = (operationId, base, changes) => sync.applySyncMutation(owner, {operationId, mutation:{type:'object.patch',patch:{id:organizedId,baseRevision:1,base,changes}}})
  const linked = await editLinks('links-create',{givenBy:[],depicted:[],tagged:[],inCollections:[]},{givenBy:[adaAlias],depicted:[adaAlias],tagged:[newTag],inCollections:[newShelf]})
  assert.equal(linked.outcome,'applied')
  assert.equal((await db.select().from(schema.people).where(orm.eq(schema.people.ownerId,owner))).length,1,'case-insensitive existing name is reused')
  assert.equal((await db.select().from(schema.people).where(orm.eq(schema.people.id,person.id)))[0].name,'Ada','adding a name never renames an existing person')
  assert.equal((await editLinks('links-create',{},{})).outcome,'rejected','invalid retry payload cannot mutate archive')
  assert.equal((await editLinks('links-create',{givenBy:[]},{givenBy:[adaAlias]})).outcome,'applied','valid retry uses saved receipt')
  assert.equal((await db.select().from(schema.collections).where(orm.eq(schema.collections.ownerId,owner))).length,1)
  const moreTag={id:randomUUID(),name:'Paper',create:true}
  assert.equal((await editLinks('links-next',{givenBy:[adaAlias],tagged:[newTag]},{givenBy:[],tagged:[newTag,moreTag]})).outcome,'applied','successive local baselines resolve duplicate-name aliases')
  assert.equal((await db.select().from(schema.objectPeople).where(orm.and(orm.eq(schema.objectPeople.objectId,organizedId),orm.eq(schema.objectPeople.role,'depicted')))).length,1,'other roles are preserved')
  const [foreignPerson]=await db.insert(schema.people).values({ownerId:other,name:'Foreign'}).returning()
  const orphan={id:randomUUID(),name:'Must not be created',create:true}
  assert.equal((await editLinks('links-foreign',{givenBy:[],tagged:[newTag,moreTag]},{givenBy:[foreignPerson],tagged:[orphan]})).outcome,'rejected')
  assert.equal((await db.select().from(schema.tags).where(orm.eq(schema.tags.id,orphan.id))).length,0,'all ownership checks precede creating names')
  const [smart]=await db.insert(schema.collections).values({ownerId:owner,name:'Smart',kind:'smart'}).returning()
  assert.equal((await editLinks('links-smart',{inCollections:[newShelf]},{inCollections:[smart]})).outcome,'rejected')
  await db.update(schema.collectionObjects).set({sortOrder:17}).where(orm.eq(schema.collectionObjects.objectId,organizedId))
  const otherShelf={id:randomUUID(),name:'Second shelf',create:true}
  assert.equal((await editLinks('links-shelf',{inCollections:[newShelf]},{inCollections:[newShelf,otherShelf]})).outcome,'applied')
  assert.equal((await db.select().from(schema.collectionObjects).where(orm.eq(schema.collectionObjects.collectionId,newShelf.id)))[0].sortOrder,17)
  await db.delete(schema.objectTags).where(orm.eq(schema.objectTags.objectId,organizedId))
  const linkConflict=await editLinks('links-conflict',{tagged:[newTag,moreTag]},{tagged:[orphan]})
  assert.equal(linkConflict.outcome,'conflict')
  assert.equal(linkConflict.conflict.current.tagged.length,0)
  assert.equal((await db.select().from(schema.tags).where(orm.eq(schema.tags.id,orphan.id))).length,0,'conflicts never create orphan names')
  assert.equal((await editLinks('links-resolve',{tagged:linkConflict.conflict.current.tagged},{tagged:[orphan]})).outcome,'applied')
  await pool.query(`create function fail_link_probe() returns trigger language plpgsql as $$ begin raise exception 'forced link rollback'; end $$`)
  await pool.query(`create trigger fail_link_probe before insert on object_tags for each row execute function fail_link_probe()`)
  const rollbackTag={id:randomUUID(),name:'Rollback tag',create:true}
  await assert.rejects(editLinks('links-rollback',{tagged:[orphan]},{tagged:[rollbackTag]}))
  await pool.query('drop trigger fail_link_probe on object_tags')
  assert.equal((await db.select().from(schema.tags).where(orm.eq(schema.tags.id,rollbackTag.id))).length,0)
  assert.equal((await db.select().from(schema.syncOperations).where(orm.eq(schema.syncOperations.operationId,'links-rollback'))).length,0)
  assert.equal((await db.select().from(schema.objectTags).where(orm.eq(schema.objectTags.objectId,organizedId)))[0].tagId,orphan.id)
  await db.delete(schema.tags).where(orm.eq(schema.tags.id,orphan.id))
  assert.equal((await editLinks('links-deleted-alias',{tagged:[]},{tagged:[orphan]})).outcome,'rejected','deleted previously synced references are never silently recreated')
  const [station]=await db.insert(schema.places).values({ownerId:owner,name:'Union Station',lat:40.1,lng:-74.2}).returning()
  const stationAlias={id:randomUUID(),name:'UNION STATION',create:true},birthday={id:randomUUID(),name:'Birthday',create:true}
  assert.equal((await editLinks('links-location',{atPlace:[],onOccasion:[]},{atPlace:[stationAlias],onOccasion:[birthday]})).outcome,'applied')
  assert.equal((await db.select().from(schema.objects).where(orm.eq(schema.objects.id,organizedId)))[0].placeId,station.id)
  assert.equal((await db.select().from(schema.places).where(orm.eq(schema.places.id,station.id)))[0].lat,40.1,'adding a place name preserves saved coordinates')
  assert.equal((await editLinks('links-location-next',{atPlace:[stationAlias]},{atPlace:[]})).outcome,'applied')
  assert.equal((await db.select().from(schema.objects).where(orm.eq(schema.objects.id,organizedId)))[0].placeId,null)
  const forbiddenOccasion={id:randomUUID(),name:'Forbidden orphan',create:true}
  assert.equal((await editLinks('links-location-foreign',{atPlace:[],onOccasion:[birthday]},{atPlace:[otherPlace],onOccasion:[forbiddenOccasion]})).outcome,'rejected')
  assert.equal((await db.select().from(schema.occasions).where(orm.eq(schema.occasions.id,forbiddenOccasion.id))).length,0)
  assert.equal((await editLinks('links-location-multiple',{atPlace:[]},{atPlace:[station,otherPlace]})).outcome,'rejected')
  assert.equal((await editLinks('links-location-mixed',{atPlace:[],placeId:null},{atPlace:[station],placeId:otherPlace.id})).outcome,'rejected')
  await db.update(schema.objects).set({placeId:station.id}).where(orm.eq(schema.objects.id,organizedId))
  const placeConflict=await editLinks('links-location-conflict',{atPlace:[]},{atPlace:[]})
  assert.equal(placeConflict.outcome,'conflict')
  assert.equal(placeConflict.conflict.current.atPlace[0].name,'Union Station')
  const unicodeTag={id:randomUUID(),name:'İstanbul',create:true}
  assert.equal((await editLinks('links-unicode',{tagged:[]},{tagged:[unicodeTag]})).outcome,'applied','name lookup uses the same database folding as the unique key')
  assert.equal((await db.select().from(schema.tags).where(orm.eq(schema.tags.id,unicodeTag.id)))[0].name,'İstanbul')
  console.log('PASS offline place/occasion creation, alias reuse, coordinate preservation, clearing, ownership, and concurrent online edits')
  console.log('PASS atomic offline names and links, duplicate-name aliases, role preservation, membership ordering, ownership, conflicts, and rollback')
  console.log('verify-sync: passed')
} finally { await pool?.end(); await admin.query(`drop database if exists ${database}`); await admin.end() }
