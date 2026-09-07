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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `shelf_removal_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-shelf-removal-`)
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
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { shelfOrderBase, shelfDeletionBase, reviewShelfDeletion } = await import(`${outdir}/shelves.mjs`)
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
    const owner=`remove-shelf-${++serial}`;await db.insert(schema.users).values({id:owner})
    const [shelf,other]=await db.insert(schema.collections).values([{ownerId:owner,name:'Keepsakes',kind:'shelf',sortOrder:4},{ownerId:owner,name:'Other shelf',kind:'shelf',sortOrder:5}]).returning()
    const [object]=await db.insert(schema.objects).values({ownerId:owner,lotNo:1,title:'Card'}).returning()
    await db.insert(schema.collectionObjects).values([{collectionId:shelf.id,objectId:object.id,sortOrder:7},{collectionId:other.id,objectId:object.id,sortOrder:9}])
    await db.insert(schema.syncClientIds).values({ownerId:owner,entity:'collection',clientId:shelf.id,serverId:shelf.id})
    await store.replaceSnapshot(owner,await server.getSyncSnapshot(owner))
    return {owner,id:shelf.id,other:other.id,object}
  }
  const save=async f=>store.saveShelfDeletion(f.owner,f.id,JSON.stringify(shelfDeletionBase(await projected(f.owner),f.id)))
  const review=async(f,entry)=>{let library=await store.readLibrary(f.owner);if(library.archive.refreshedAt<=(library.operations.find(row=>row.operationId===entry.operationId)?.responseAt??-1)){await new Promise(resolve=>setTimeout(resolve,2));await store.replaceSnapshot(f.owner,await server.getSyncSnapshot(f.owner));library=await store.readLibrary(f.owner)}return reviewShelfDeletion(library.archive,library.operations,entry.operationId)}
  {
    const f=await setup(),before=await server.getSyncSnapshot(f.owner),entry=await save(f)
    const current=await projected(f.owner);assert.equal(current.collections.some(row=>row.id===f.id),false);assert.equal(current.memberships.length,1);assert.equal(current.records.length,1)
    await assert.rejects(store.saveObjectChanges(f.owner,f.object.id,current.records[0],{inCollections:[{id:f.id,name:'Back',create:true}]}),/shelf was removed/)
    await assert.rejects(store.saveShelfOrder(f.owner,JSON.stringify(shelfOrderBase(current)),[f.other]),/Sync or review/)
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    const after=await server.getSyncSnapshot(f.owner)
    assert.equal(JSON.stringify(after.records),JSON.stringify(before.records));assert.equal(after.memberships.length,1);assert.equal(after.memberships[0].sortOrder,9)
    assert.equal(after.tombstones.find(row=>row.id===f.id).revision,2)
    assert.equal((await pool.query('select 1 from sync_client_ids where owner_id=$1 and client_id=$2',[f.owner,f.id])).rowCount,1)
    assert.equal((await server.applySyncMutation(f.owner,entry)).outcome,'applied')
    assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation:{type:'collection.create',id:f.id,values:{name:'Back'}}})).outcome,'rejected')
    assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation:{type:'object.patch',patch:{id:f.object.id,baseRevision:1,base:{inCollections:[{id:f.other,name:'Other shelf'}]},changes:{inCollections:[{id:f.id,name:'Back',create:true}]}}}})).outcome,'rejected')
  }
  console.log('1 only shelf/memberships removed; objects/revisions/other shelves/mappings preserved; tombstone blocks stale recreation')
  for(const kind of ['live','expired','foreign']) {
    const f=await setup(),entry=await save(f),owner=kind==='foreign'?(await setup()).owner:f.owner,token=`private-capability-${crypto.randomUUID()}`
    const [share]=await db.insert(schema.shares).values({ownerId:owner,collectionId:f.id,token,...(kind==='expired'?{expiresAt:new Date(0)}:{})}).returning()
    assert.equal((await syncArchive(f.owner,active)).status,'rejected')
    const result=await server.applySyncMutation(f.owner,entry);assert.equal(result.reason,'shared_collection');assert.equal(JSON.stringify(result.shareIds),JSON.stringify(kind==='foreign'?[]:[share.id]));assert.equal(JSON.stringify(result).includes(token),false)
    assert.equal((await pool.query('select 1 from shares where id=$1',[share.id])).rowCount,1)
    const r=await review(f,entry),other=await store.saveObjectChanges(f.owner,f.object.id,(await projected(f.owner)).records[0],{title:'Unrelated'})
    await assert.rejects(store.resolveShelfDeletion(f.owner,entry.operationId,r.token,true),/Keep the archive shelf/)
    await store.resolveShelfDeletion(f.owner,entry.operationId,r.token,false)
    assert.equal((await store.listOperations(f.owner))[0].operationId,other.operationId)
    assert.equal((await projected(f.owner)).collections.find(row=>row.id===f.id).name,'Keepsakes')
    assert.equal((await projected(f.owner)).memberships.length,2)
  }
  console.log('2 live/expired/inconsistent-owner share rows refuse removal; opaque own IDs only, no tokens; recovery preserves unrelated work')
  for(const change of ['name','position','tags','membership','removed-member']) {
    const f=await setup(),entry=await save(f)
    if(change==='name')await db.update(schema.collections).set({name:'Changed'}).where(orm.eq(schema.collections.id,f.id))
    if(change==='position')await db.update(schema.collections).set({sortOrder:22}).where(orm.eq(schema.collections.id,f.id))
    if(change==='tags')await db.update(schema.collections).set({impliedTags:['Changed']}).where(orm.eq(schema.collections.id,f.id))
    if(change==='membership')await db.update(schema.collectionObjects).set({sortOrder:33}).where(orm.eq(schema.collectionObjects.collectionId,f.id))
    if(change==='removed-member')await db.delete(schema.collectionObjects).where(orm.eq(schema.collectionObjects.collectionId,f.id))
    assert.equal((await syncArchive(f.owner,active)).status,'conflict')
    const r=await review(f,entry);await assert.rejects(store.resolveShelfDeletion(f.owner,entry.operationId,'stale',true),/changed/)
    await store.resolveShelfDeletion(f.owner,entry.operationId,r.token,true)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal((await server.getSyncSnapshot(f.owner)).records.length,1)
  }
  console.log('3 metadata and membership-position/removal drift conflicts, fresh baseline retry preserves objects')
  {
    const f=await setup();await store.saveShelfName(f.owner,f.id,'Keepsakes','Pending');await assert.rejects(save(f),/saved shelf/)
    const g=await setup(),snap=await projected(g.owner);await store.saveObjectChanges(g.owner,g.object.id,snap.records[0],{inCollections:[{id:g.other,name:'Other shelf'}]});await assert.rejects(save(g),/saved shelf/)
    const h=await setup(),order=shelfOrderBase(await projected(h.owner));await store.saveShelfOrder(h.owner,JSON.stringify(order),order.map(row=>row.id).reverse());await assert.rejects(save(h),/saved shelf/)
    const i=await setup();await assert.rejects(store.saveShelfDeletion(i.owner,i.id,'stale'),/another tab/)
    await db.update(schema.collections).set({kind:'smart'}).where(orm.eq(schema.collections.id,i.id));await store.replaceSnapshot(i.owner,await server.getSyncSnapshot(i.owner));await assert.rejects(save(i),/manual shelf/)
    const j=await setup(),before=await store.readLibrary(j.owner)
    IDBObjectStore.prototype.add=function(...args){const request=originalAdd.apply(this,args);if(this.name==='outbox')request.addEventListener('success',()=>this.transaction.abort());return request}
    await assert.rejects(save(j));IDBObjectStore.prototype.add=originalAdd;assert.deepEqual(await store.readLibrary(j.owner),before)
    await assert.rejects(store.saveShelfDeletion('foreign',j.id,''),/Prepare/)
    const created=await store.createShelf(j.owner,'New');await assert.rejects(store.saveShelfDeletion(j.owner,created.mutation.id,''),/saved shelf/)
  }
  console.log('4 pending rename/order/membership/creation, virtual/nonmanual/stale/owner and local abort guards passed')
  {
    const f=await setup(),entry=await save(f);lose=true;sent=[]
    await assert.rejects(syncArchive(f.owner,active),/lost acknowledgement/);assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal(sent[0],sent[1])
    const g=await setup(),pending=await save(g)
    malformed={outcome:'rejected',reason:'shared_collection',shareIds:['https://secret-token']}
    await assert.rejects(syncArchive(g.owner,active),/removal response is unexpected/);malformed=undefined
    assert.equal((await store.listOperations(g.owner))[0].response,undefined)
    let activeOwner=true;const originalFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const r=await originalFetch(...args);activeOwner=false;return r}
    assert.equal((await syncArchive(g.owner,{isActiveOwner:()=>activeOwner})).status,'locked');globalThis.fetch=originalFetch
    assert.equal((await store.listOperations(g.owner))[0].response,undefined);assert.equal((await syncArchive(g.owner,active)).status,'synced')
    const h=await setup(),foreign=await server.applySyncMutation(h.owner,{operationId:crypto.randomUUID(),mutation:entry.mutation});assert.equal(foreign.conflict.current,null)
    for(const mutation of [{...pending.mutation,id:'bad'},{...pending.mutation,base:{metadata:{},links:['bad']}},{...pending.mutation,baseRevision:0}])assert.equal((await server.applySyncMutation(h.owner,{operationId:crypto.randomUUID(),mutation})).outcome,'rejected')
  }
  console.log('5 exact-byte lost acknowledgement, malformed refusal/account-switch retention and server owner/input guards passed')
  {
    const f=await setup(),entry=await save(f),before=await server.getSyncSnapshot(f.owner)
    await pool.query(`create function shelf_remove_rollback() returns trigger language plpgsql as $$ begin raise exception 'removal rollback'; end $$`)
    await pool.query(`create trigger shelf_remove_rollback before insert on sync_operations for each row execute function shelf_remove_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner,entry));assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)),JSON.stringify(before))
    await pool.query('drop trigger shelf_remove_rollback on sync_operations');await pool.query('drop function shelf_remove_rollback()')
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  console.log('6 receipt failure rolls back shelf, memberships and tombstone; retry succeeds')
  {
    const f=await setup(),entry=await save(f),writer=await pool.connect()
    try {
      await writer.query('begin');await writer.query('insert into shares(owner_id,collection_id,token) values($1,$2,$3)',[f.owner,f.id,'share-first'])
      let settled=false;const removing=server.applySyncMutation(f.owner,entry).finally(()=>{settled=true})
      await new Promise(resolve=>setTimeout(resolve,50));assert.equal(settled,false)
      await writer.query('commit');assert.equal((await removing).reason,'shared_collection')
      assert.equal((await pool.query('select 1 from shares where collection_id=$1',[f.id])).rowCount,1)
      assert.equal((await pool.query('select 1 from collections where id=$1',[f.id])).rowCount,1)
    } finally {await writer.query('rollback');writer.release()}
  }
  console.log('7 concurrent share insertion first: deletion waits, then refuses without revoking the committed share')
  {
    const f=await setup(),entry=await save(f),gate=await pool.connect()
    await pool.query(`create function shelf_remove_pause() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(12112); return OLD; end $$`)
    await pool.query(`create trigger shelf_remove_pause before delete on collections for each row execute function shelf_remove_pause()`)
    try {
      await gate.query('select pg_advisory_lock(12112)')
      const removing=server.applySyncMutation(f.owner,entry)
      let waiting=false
      for(let attempt=0;attempt<100;attempt++){waiting=(await pool.query("select 1 from pg_locks where locktype='advisory' and objid=12112 and not granted")).rowCount>0;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5))}
      assert.equal(waiting,true)
      let settled=false;const inserting=pool.query('insert into shares(owner_id,collection_id,token) values($1,$2,$3)',[f.owner,f.id,'remove-first']).then(()=>({code:'ok'}),error=>({code:error.code})).finally(()=>{settled=true})
      await new Promise(resolve=>setTimeout(resolve,50));assert.equal(settled,false)
      await gate.query('select pg_advisory_unlock(12112)');assert.equal((await removing).outcome,'applied');assert.equal((await inserting).code,'23503')
      assert.equal((await pool.query('select 1 from shares where collection_id=$1',[f.id])).rowCount,0)
      assert.equal((await server.getSyncSnapshot(f.owner)).records.length,1)
    } finally {await gate.query('select pg_advisory_unlock(12112)');gate.release();await pool.query('drop trigger shelf_remove_pause on collections');await pool.query('drop function shelf_remove_pause()')}
  }
  console.log('8 deletion lock first: concurrent share insertion waits then fails FK; no accepted share is cascaded away')
  console.log('verify-shelf-removal: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add=originalAdd;await pool?.end();await admin.query(`drop database if exists ${database}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);await admin.end();rmSync(outdir,{recursive:true,force:true});console.log(`cleanup confirmed: ${database} absent`) }
