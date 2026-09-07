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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `shelf_order_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-shelf-order-`)
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
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { shelfOrderBase, shelfOrderRows, reviewShelfOrder } = await import(`${outdir}/shelves.mjs`)
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
    const shelves = await db.insert(schema.collections).values(['A', 'B', 'C'].map(name => ({ ownerId: owner, name, kind: 'shelf', sortOrder: 0 }))).returning()
    const [smart] = await db.insert(schema.collections).values({ ownerId: owner, name: 'Smart', kind: 'smart', sortOrder: 99 }).returning()
    await db.insert(schema.collectionObjects).values({ objectId: object.id, collectionId: shelves[0].id, sortOrder: 7 })
    await store.replaceSnapshot(owner, await server.getSyncSnapshot(owner))
    const snapshot = await projected(owner), ids = shelfOrderRows(snapshot).map(row => row.id), base = JSON.stringify(shelfOrderBase(snapshot))
    return { owner, object, ids, base, smart }

  }
  const order = async owner => shelfOrderRows(await projected(owner)).map(row => row.id)
  async function review(owner) {
    const library = await store.readLibrary(owner)
    return reviewShelfOrder(library.archive, library.operations)
  }
  {
    const f = await setup(), ids = [...f.ids].reverse(), before = await server.getSyncSnapshot(f.owner)
    const entry = await store.saveShelfOrder(f.owner, f.base, ids)
    assert.deepEqual(await order(f.owner), ids)
    await assert.rejects(store.saveShelfOrder(f.owner,f.base,f.ids), /Sync or review/)
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    const after = await server.getSyncSnapshot(f.owner)
    assert.deepEqual(await order(f.owner),ids)
    assert.equal(JSON.stringify(after.memberships),JSON.stringify(before.memberships))
    for(const row of after.collections) {
      const original=before.collections.find(old=>old.id===row.id)
      for(const key of Object.keys(original).filter(key=>!['sortOrder','revision'].includes(key)))assert.equal(JSON.stringify(row[key]),JSON.stringify(original[key]))
      assert.equal(row.sortOrder,row.kind==='shelf'?ids.indexOf(row.id):99)
      assert.equal(row.revision,row.kind==='shelf'&&ids.indexOf(row.id)!==original.sortOrder?2:1)
    }
    assert.equal((await server.applySyncMutation(f.owner,entry)).outcome,'applied')
    assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)),JSON.stringify(after))
    const snap=await projected(f.owner)
    await store.saveShelfOrder(f.owner,JSON.stringify(shelfOrderBase(snap)),f.ids)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.deepEqual(await order(f.owner),f.ids)
  }
  console.log('1 tied/default positions reorder both directions; metadata, smart shelves and member positions unchanged; revisions and receipt replay passed')
  {
    const f=await setup(),entry=await store.saveShelfOrder(f.owner,f.base,[...f.ids].reverse());sent=[];lose=true
    await assert.rejects(syncArchive(f.owner,active),/lost acknowledgement/)
    assert.equal((await store.listOperations(f.owner))[0].operationId,entry.operationId)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal(sent[0],sent[1])
    const other=await setup();await store.saveShelfOrder(other.owner,other.base,[...other.ids].reverse())
    await db.update(schema.collections).set({name:'Concurrent name'}).where(orm.eq(schema.collections.id,other.ids[0]))
    await db.update(schema.collectionObjects).set({sortOrder:42}).where(orm.eq(schema.collectionObjects.objectId,other.object.id))
    assert.equal((await syncArchive(other.owner,active)).status,'synced')
    assert.equal((await projected(other.owner)).collections.find(row=>row.id===other.ids[0]).name,'Concurrent name')
    assert.equal((await projected(other.owner)).memberships[0].sortOrder,42)
  }
  console.log('2 exact-byte lost acknowledgement retry and independent remote name/member changes passed')
  for(const change of ['order','added','removed','kind']) {
    const f=await setup(),entry=await store.saveShelfOrder(f.owner,f.base,[...f.ids].reverse())
    if(change==='order')await db.update(schema.collections).set({sortOrder:44}).where(orm.eq(schema.collections.id,f.ids[0]))
    if(change==='added')await db.insert(schema.collections).values({ownerId:f.owner,name:'Added',kind:'shelf'})
    if(change==='removed')await db.delete(schema.collections).where(orm.eq(schema.collections.id,f.ids[0]))
    if(change==='kind')await db.update(schema.collections).set({kind:'cluster'}).where(orm.eq(schema.collections.id,f.ids[0]))
    const before=await server.getSyncSnapshot(f.owner)
    assert.equal((await syncArchive(f.owner,active)).status,'conflict')
    assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)),JSON.stringify(before))
    let r=await review(f.owner)
    if(!r.refreshed) { await new Promise(resolve=>setTimeout(resolve,2));await store.replaceSnapshot(f.owner,await server.getSyncSnapshot(f.owner));r=await review(f.owner) }
    const other=await store.saveObjectChanges(f.owner,f.object.id,(await projected(f.owner)).records[0],{title:'Unrelated title'})
    await assert.rejects(store.discardShelfOrder('foreign',r.token),/Refresh/)
    await assert.rejects(store.discardShelfOrder(f.owner,'stale'),/Refresh/)
    await store.discardShelfOrder(f.owner,r.token)
    assert.equal((await store.listOperations(f.owner))[0].operationId,other.operationId)
    assert.equal((await projected(f.owner)).records[0].title,'Unrelated title')
    assert.equal((await store.listOperations(f.owner)).some(row=>row.operationId===entry.operationId),false)
    assert.equal(JSON.stringify(shelfOrderBase(await projected(f.owner))),JSON.stringify(shelfOrderBase(before)))
  }
  console.log('3 concurrent order/add/remove/kind changes conflict; fresh recovery drops only its order and preserves unrelated work')
  {
    const f=await setup()
    await assert.rejects(store.saveShelfOrder(f.owner,'stale',f.ids),/changed in another tab/)
    for(const ids of [[f.ids[0]], [f.ids[0],f.ids[0],f.ids[1]], [f.smart.id,...f.ids.slice(1)]])await assert.rejects(store.saveShelfOrder(f.owner,f.base,ids),/manual shelves/)
    await assert.rejects(store.saveShelfOrder('unknown',f.base,f.ids),/Prepare/)
    const before=await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add=function(...args){const request=originalAdd.apply(this,args);if(this.name==='outbox')request.addEventListener('success',()=>this.transaction.abort());return request}
    await assert.rejects(store.saveShelfOrder(f.owner,f.base,[...f.ids].reverse()));IDBObjectStore.prototype.add=originalAdd
    assert.deepEqual(await store.readLibrary(f.owner),before)
    await store.createShelf(f.owner,'Pending');await assert.rejects(store.saveShelfOrder(f.owner,f.base,f.ids),/Sync or review/)
    const g=await setup(),snap=await projected(g.owner)
    await store.saveObjectChanges(g.owner,g.object.id,snap.records[0],{inCollections:[{id:crypto.randomUUID(),name:'Pending object shelf',create:true}]})
    await assert.rejects(store.saveShelfOrder(g.owner,g.base,g.ids),/Sync or review/)
  }
  console.log('4 stale tabs, invalid sets, local transaction abort and both pending shelf creation paths are guarded')
  {
    const f=await setup(),entry=await store.saveShelfOrder(f.owner,f.base,[...f.ids].reverse())
    const originalFetch=globalThis.fetch
    globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);activeOwner=false;return response}
    assert.equal((await syncArchive(f.owner,{isActiveOwner:()=>activeOwner})).status,'locked')
    assert.equal((await store.listOperations(f.owner))[0].response,undefined);globalThis.fetch=originalFetch;activeOwner=true
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    for(const mutation of [{...entry.mutation,base:[]},{...entry.mutation,ids:['bad']},{...entry.mutation,base:entry.mutation.base.map(row=>({...row,sortOrder:1.5}))}])assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation})).outcome,'rejected')
    const g=await setup(),foreign=await server.applySyncMutation(g.owner,{operationId:crypto.randomUUID(),mutation:entry.mutation})
    assert.equal(foreign.outcome,'conflict');assert.equal(foreign.conflict.current,null)
    const h=await setup(),pending=await store.saveShelfOrder(h.owner,h.base,[...h.ids].reverse())
    malformed={outcome:'conflict',conflict:{entity:'collection',id:pending.mutation.ids[0],revision:1,current:{name:'Foreign'},fields:['order']}}
    await assert.rejects(syncArchive(h.owner,active),/order response is unexpected/);malformed=undefined
    assert.equal((await store.listOperations(h.owner))[0].response,undefined)
    await store.recordResponse(h.owner,{operationId:pending.operationId,outcome:'rejected'})
    await assert.rejects(store.discardShelfOrder(h.owner,(await review(h.owner)).token),/Refresh/)
    await new Promise(resolve=>setTimeout(resolve,2));await store.replaceSnapshot(h.owner,await server.getSyncSnapshot(h.owner))
    await store.discardShelfOrder(h.owner,(await review(h.owner)).token);assert.equal((await store.listOperations(h.owner)).length,0)
  }
  console.log('5 account switch, server input/owner guards, malformed response retention and rejected fresh recovery passed')
  {
    const f=await setup(),entry=await store.saveShelfOrder(f.owner,f.base,[...f.ids].reverse()),before=await server.getSyncSnapshot(f.owner)
    await pool.query(`create function order_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'order rollback'; end $$`)
    await pool.query(`create trigger order_receipt_rollback before insert on sync_operations for each row execute function order_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner,entry))
    assert.equal(JSON.stringify(await server.getSyncSnapshot(f.owner)),JSON.stringify(before))
    assert.equal((await pool.query('select 1 from sync_entities where owner_id=$1',[f.owner])).rowCount,0)
    await pool.query('drop trigger order_receipt_rollback on sync_operations');await pool.query('drop function order_receipt_rollback()')
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  console.log('6 receipt failure rolls back every shelf position and revision; immutable retry succeeds')
  console.log('verify-shelf-order: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add=originalAdd;await pool?.end();await admin.query(`drop database if exists ${database}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);await admin.end();rmSync(outdir,{recursive:true,force:true});console.log(`cleanup confirmed: ${database} absent`) }
