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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `shelf_creation_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-shelf-creation-`)
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
  for (const name of ['store', 'edits', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`)
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
    const owner = `create-shelf-${++serial}`
    await db.insert(schema.users).values({ id: owner })
    const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Card' }).returning()
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    return { owner, object }
  }
  {
    const f = await setup(), first = await store.createShelf(f.owner, ' New shelf '), second = await store.createShelf(f.owner, 'New shelf')
    assert.notEqual(first.mutation.id, second.mutation.id)
    const current = await projected(f.owner)
    assert.equal(current.collections.length, 2); assert.equal(current.collections[0].name, 'New shelf'); assert.equal(current.memberships.length, 0)
    assert.equal(current.collections.every(row => row.localOnly && row.pendingCreation), true)
    assert.equal(links.linkChoices(current, 'inCollections').length, 2)
    assert.equal(links.linkChoices(current, 'inCollections').every(ref => !ref.create), true)
    await assert.rejects(store.saveShelfName(f.owner, first.mutation.id, 'New shelf', 'No'), /already saved/)
    await assert.rejects(store.discardShelfCreation(f.owner, first.operationId), /changed/)
    assert.equal((await syncArchive(f.owner, active)).status, 'synced')
    const remote = await server.getSyncSnapshot(f.owner); assert.equal(remote.collections.length, 2); assert.equal(remote.memberships.length, 0)
    for (const row of remote.collections) { assert.equal(row.kind,'shelf'); assert.equal(row.sortOrder,0); assert.equal(JSON.stringify(row.impliedTags),'[]'); for (const key of ['rule','boardX','boardY','boardW','boardH']) assert.equal(row[key],null) }
    const snap = await projected(f.owner)
    await store.saveObjectChanges(f.owner, f.object.id, snap.records[0], { inCollections: links.linkChoices(snap,'inCollections').filter(ref => ref.id === first.mutation.id) })
    await store.saveShelfName(f.owner, first.mutation.id, 'New shelf', 'After sync')
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    assert.equal((await server.getSyncSnapshot(f.owner)).collections.length,2)
    assert.equal((await projected(f.owner)).records[0].inCollections[0].name,'After sync')
  }
  console.log('1 durable empty shelves/defaults/duplicate IDs, pre-sync explicit choices and rename guards and post-sync linking/rename passed')
  {
    const f = await setup(), entry = await store.createShelf(f.owner,'Retry shelf'); sent=[];lose=true
    await assert.rejects(syncArchive(f.owner,active),/lost acknowledgement/)
    assert.equal((await store.listOperations(f.owner))[0].operationId,entry.operationId)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal(sent[0],sent[1])
    assert.equal((await server.getSyncSnapshot(f.owner)).collections.length,1)
    assert.equal((await server.applySyncMutation(f.owner,entry)).outcome,'applied')
  }
  console.log('2 lost acknowledgement reuses exact operation and creates only one shelf')
  for (const collision of ['same-owner','foreign-owner','tombstone','mapping']) {
    const f=await setup(),entry=await store.createShelf(f.owner,'Keep for export'),id=entry.mutation.id
    if(collision.endsWith('owner')) {
      const owner=collision==='same-owner'?f.owner:(await setup()).owner
      await db.insert(schema.collections).values({id,ownerId:owner,name:'Keep existing',kind:'shelf',sortOrder:88})
      if(collision==='same-owner')await db.insert(schema.collectionObjects).values({objectId:f.object.id,collectionId:id,sortOrder:3})
    }else if(collision==='tombstone')await db.insert(schema.syncEntities).values({ownerId:f.owner,entity:'collection',entityId:id,revision:4,deletedAt:new Date()})
    else await db.insert(schema.syncClientIds).values({ownerId:f.owner,entity:'collection',clientId:id,serverId:crypto.randomUUID()})
    assert.equal((await syncArchive(f.owner,active)).status,'rejected')
    const result=await server.applySyncMutation(f.owner,entry);assert.equal(result.outcome,'rejected');assert.equal(result.conflict,undefined)
    if(collision==='same-owner') {
      const current=await projected(f.owner)
      assert.equal(current.records[0].inCollections[0].name,'Keep existing')
      assert.equal(current.memberships[0].collectionId,id)
      assert.equal(links.linkChoices(current,'inCollections').length,0)
      await assert.rejects(store.saveObjectChanges(f.owner,f.object.id,current.records[0],{inCollections:[]}),/Review this new shelf/)
    }
    const before=await server.getSyncSnapshot(f.owner),other=await store.saveObjectChanges(f.owner,f.object.id,(await projected(f.owner)).records[0],{title:'Keep unrelated'})
    await assert.rejects(store.discardShelfCreation('foreign',entry.operationId),/changed/)
    await store.discardShelfCreation(f.owner,entry.operationId)
    assert.equal((await store.listOperations(f.owner))[0].operationId,other.operationId)
    assert.equal((await projected(f.owner)).records[0].title,'Keep unrelated')
    assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)),JSON.stringify(before))
    if(collision==='same-owner')assert.equal((await projected(f.owner)).collections[0].name,'Keep existing')
    else assert.equal((await projected(f.owner)).collections.length,0)
  }
  console.log('3 UUID/owner/tombstone/mapping collisions never overwrite; rejected discard preserves unrelated work and existing rows')
  {
    const f=await setup(),entry=await store.createShelf(f.owner,'Guarded')
    await store.recordResponse(f.owner,{operationId:entry.operationId,outcome:'rejected'})
    await store.saveOperation(f.owner,{type:'object.patch',patch:{id:f.object.id,baseRevision:1,base:{inCollections:[]},changes:{inCollections:[{id:entry.mutation.id,name:'Guarded',create:true}]}}})
    await assert.rejects(store.discardShelfCreation(f.owner,entry.operationId),/Pending edits still use/)
    assert.equal((await store.listOperations(f.owner)).length,2)
    const other=await setup(),snap=await projected(other.owner),id=crypto.randomUUID()
    await store.saveObjectChanges(other.owner,other.object.id,snap.records[0],{inCollections:[{id,name:'Object-created shelf',create:true}]})
    assert.equal((await syncArchive(other.owner,active)).status,'synced')
    assert.equal((await server.getSyncSnapshot(other.owner)).collections[0].id,id)
  }
  console.log('4 defensive dependent-operation check prevents recreation; existing object-created shelves still sync')
  {
    const f=await setup();await assert.rejects(store.createShelf(f.owner,' '));await assert.rejects(store.createShelf(f.owner,'x'.repeat(251)));await assert.rejects(store.createShelf('unknown','No'))
    const before=await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add=function(...args){const request=originalAdd.apply(this,args);if(this.name==='outbox')request.addEventListener('success',()=>this.transaction.abort());return request}
    await assert.rejects(store.createShelf(f.owner,'Aborted'));IDBObjectStore.prototype.add=originalAdd;assert.deepEqual(await store.readLibrary(f.owner),before)
    const entry=await store.createShelf(f.owner,'Account switch'),originalFetch=globalThis.fetch
    globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);activeOwner=false;return response}
    assert.equal((await syncArchive(f.owner,{isActiveOwner:()=>activeOwner})).status,'locked')
    assert.equal((await store.listOperations(f.owner))[0].response,undefined);globalThis.fetch=originalFetch;activeOwner=true
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal((await server.getSyncSnapshot(f.owner)).collections.length,1)
    for(const mutation of [{...entry.mutation,id:'loose'},{...entry.mutation,values:{name:'',kind:'smart'}},{...entry.mutation,values:{name:'x'.repeat(251)}}])assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation})).outcome,'rejected')
  }
  console.log('5 invalid inputs, local abort and account switch preserve data with idempotent retry')
  {
    const f=await setup(),entry=await store.createShelf(f.owner,'Rollback')
    malformed={outcome:'conflict',conflict:{entity:'collection',id:entry.mutation.id,revision:1,current:null,fields:['name']}}
    await assert.rejects(syncArchive(f.owner,active),/creation response is unexpected/);assert.equal((await store.listOperations(f.owner))[0].response,undefined);malformed=undefined
    await pool.query(`create function creation_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'creation rollback'; end $$`)
    await pool.query(`create trigger creation_receipt_rollback before insert on sync_operations for each row execute function creation_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner,entry))
    assert.equal((await server.getSyncSnapshot(f.owner)).collections.length,0)
    assert.equal((await pool.query('select 1 from sync_entities where owner_id=$1',[f.owner])).rowCount,0)
    assert.equal((await pool.query('select 1 from sync_client_ids where owner_id=$1',[f.owner])).rowCount,0)
    await pool.query('drop trigger creation_receipt_rollback on sync_operations');await pool.query('drop function creation_receipt_rollback()')
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  console.log('6 malformed response retained; receipt failure rolls back shelf/state/mapping and retry succeeds')
  console.log('verify-shelf-creation: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add=originalAdd;await pool?.end();await admin.query(`drop database if exists ${database}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);await admin.end();rmSync(outdir,{recursive:true,force:true});console.log(`cleanup confirmed: ${database} absent`) }
