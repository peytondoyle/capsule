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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `place_coords_${process.pid}`, outdir = mkdtempSync(`${tmpdir()}/capsule-place-coords-`)
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
  for (const name of ['store', 'edits', 'taxonomy', 'sync']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`), { projectArchive } = await import(`${outdir}/edits.mjs`), { syncArchive } = await import(`${outdir}/sync.mjs`), { reviewTaxonomyName, reviewPlaceCoordinates, placeCoordinates } = await import(`${outdir}/taxonomy.mjs`)
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
  async function setup(coords={lat:null,lng:null}) {
    const owner=`coords-${++serial}`;await db.insert(schema.users).values({id:owner})
    const [place]=await db.insert(schema.places).values({ownerId:owner,name:'Museum',kind:'museum',...coords}).returning()
    const [object]=await db.insert(schema.objects).values({ownerId:owner,lotNo:1,title:'Card',placeId:place.id}).returning()
    await store.replaceSnapshot(owner,await server.getSyncSnapshot(owner));return {owner,id:place.id,object}
  }
  const remote=async owner=>(await server.getSyncSnapshot(owner)).places[0]
  const review=async f=>{const library=await store.readLibrary(f.owner);return reviewPlaceCoordinates(library.archive,library.operations,f.id)}
  const pair={lat:12.3456,lng:-45.6789}, next={lat:0,lng:0}, empty={lat:null,lng:null}
  {
    const f=await setup(),first=await store.savePlaceCoordinates(f.owner,f.id,empty,pair),bytes=JSON.stringify(first)
    const second=await store.savePlaceCoordinates(f.owner,f.id,pair,next)
    assert.equal(JSON.stringify((await store.listOperations(f.owner))[0]),bytes)
    assert.deepEqual(second.mutation.base.coordinates,pair)
    assert.deepEqual(placeCoordinates((await projected(f.owner)).places[0]),next)
    await assert.rejects(store.savePlaceCoordinates(f.owner,f.id,pair,next),/another tab/)
    await assert.rejects(store.saveTaxonomyDeletion(f.owner,'place',f.id,''),/saved changes/)
    const before=await store.readLibrary(f.owner)
    IDBObjectStore.prototype.add=function(...args){const request=originalAdd.apply(this,args);if(this.name==='outbox')request.addEventListener('success',()=>this.transaction.abort());return request}
    await assert.rejects(store.savePlaceCoordinates(f.owner,f.id,next,pair));IDBObjectStore.prototype.add=originalAdd
    assert.deepEqual(await store.readLibrary(f.owner),before)
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    assert.deepEqual(placeCoordinates(await remote(f.owner)),next);assert.equal((await remote(f.owner)).kind,'museum')
    assert.equal((await server.getSyncSnapshot(f.owner)).records[0].placeId,f.id)
    assert.equal(await store.savePlaceCoordinates(f.owner,f.id,next,next),undefined)
    await store.savePlaceCoordinates(f.owner,f.id,next,{lat:90,lng:-180});assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  console.log('1 atomic repeated pair edits, zero/bounds, metadata/links, stale tabs, deletion guard and local abort passed')
  {
    const f=await setup({lat:1,lng:null});await store.savePlaceCoordinates(f.owner,f.id,{lat:1,lng:null},pair);sent=[];lose=true
    await assert.rejects(syncArchive(f.owner,active),/lost acknowledgement/)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal(sent[0],sent[1])
    const g=await setup();await store.savePlaceCoordinates(g.owner,g.id,empty,pair)
    await db.update(schema.places).set({name:'Renamed remotely',kind:'city'}).where(orm.eq(schema.places.id,g.id))
    assert.equal((await syncArchive(g.owner,active)).status,'synced');assert.equal((await remote(g.owner)).name,'Renamed remotely');assert.equal((await remote(g.owner)).kind,'city')
  }
  console.log('2 partial legacy pair correction, exact-byte lost acknowledgement and unrelated name/kind preservation passed')
  {
    const f=await setup();await store.savePlaceCoordinates(f.owner,f.id,empty,pair)
    await store.saveTaxonomyName(f.owner,'place',f.id,'Museum','Local name')
    await db.update(schema.places).set({lat:7,lng:8}).where(orm.eq(schema.places.id,f.id))
    assert.equal((await syncArchive(f.owner,active)).status,'conflict')
    let r=await review(f);assert.deepEqual(placeCoordinates(r.local),pair);assert.deepEqual(placeCoordinates(r.remote),{lat:7,lng:8})
    await assert.rejects(store.resolvePlaceCoordinates(f.owner,f.id,'stale',{coordinates:next}),/another tab/)
    await store.resolvePlaceCoordinates(f.owner,f.id,r.token,{coordinates:next})
    assert.equal((await store.listOperations(f.owner)).length,2)
    assert.equal((await syncArchive(f.owner,active)).status,'synced');assert.equal((await remote(f.owner)).name,'Local name');assert.deepEqual(placeCoordinates(await remote(f.owner)),next)
    await store.savePlaceCoordinates(f.owner,f.id,next,pair)
    await store.saveTaxonomyName(f.owner,'place',f.id,'Local name','Keep rename')
    await db.update(schema.places).set({lat:8,lng:9}).where(orm.eq(schema.places.id,f.id))
    assert.equal((await syncArchive(f.owner,active)).status,'conflict');r=await review(f)
    await store.resolvePlaceCoordinates(f.owner,f.id,r.token,{discard:true})
    assert.equal((await store.listOperations(f.owner)).length,1);assert.equal((await projected(f.owner)).places[0].name,'Keep rename')
    assert.deepEqual(placeCoordinates((await projected(f.owner)).places[0]),{lat:8,lng:9})
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    await store.savePlaceCoordinates(f.owner,f.id,{lat:8,lng:9},pair)
    await store.saveTaxonomyName(f.owner,'place',f.id,'Keep rename','Local conflicting name')
    await db.update(schema.places).set({name:'Remote conflicting name'}).where(orm.eq(schema.places.id,f.id))
    assert.equal((await syncArchive(f.owner,active)).status,'conflict')
    const library=await store.readLibrary(f.owner),nameReview=reviewTaxonomyName(library.archive,library.operations,'place',f.id)
    await store.resolveTaxonomyName(f.owner,'place',f.id,nameReview.token,null)
    assert.deepEqual(placeCoordinates((await projected(f.owner)).places[0]),pair)
  }
  console.log('3 whole-pair conflict retry/discard and bidirectional name-recovery interoperability passed')
  {
    const f=await setup()
    const invalid=[{lat:null,lng:1},{lat:1},{lat:91,lng:0},{lat:0,lng:-181},{lat:NaN,lng:1},{lat:Infinity,lng:1},{lat:'1',lng:2},{lat:1,lng:2,name:'Injection'},{lat:1,lng:2,ownerId:'foreign'}]
    for(const value of invalid)await assert.rejects(store.savePlaceCoordinates(f.owner,f.id,empty,value))
    await assert.rejects(store.savePlaceCoordinates('unknown',f.id,empty,pair))
    const mutation={type:'taxonomy.upsert',entity:'place',id:f.id,baseRevision:1,base:{coordinates:empty},values:{coordinates:pair}}
    for(const value of invalid)assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation:{...mutation,values:{coordinates:value}}})).outcome,'rejected')
    assert.equal((await server.applySyncMutation(f.owner,{operationId:crypto.randomUUID(),mutation:{...mutation,entity:'person'}})).outcome,'rejected')
    const g=await setup(),foreign=await server.applySyncMutation(g.owner,{operationId:crypto.randomUUID(),mutation})
    assert.equal(foreign.conflict.current,null);assert.deepEqual(placeCoordinates(await remote(f.owner)),empty)
    const snapshot=await projected(f.owner);await store.replaceSnapshot(f.owner,{...snapshot,places:snapshot.places.map(row=>({...row,localOnly:true}))})
    await assert.rejects(store.savePlaceCoordinates(f.owner,f.id,empty,pair),/Sync this place/)
    await store.replaceSnapshot(f.owner,await server.getSyncSnapshot(f.owner))
    await store.saveTaxonomyDeletion(f.owner,'place',f.id,JSON.stringify({metadata:{name:'Museum',lat:null,lng:null,kind:'museum',createdAt:snapshot.places[0].createdAt,updatedAt:snapshot.places[0].updatedAt},links:[f.object.id]}))
    await assert.rejects(store.savePlaceCoordinates(f.owner,f.id,empty,pair),/Sync this place/)
  }
  console.log('4 invalid/extra pair fields, owner isolation and local-only/pending-deletion guards passed')
  {
    const f=await setup(),entry=await store.savePlaceCoordinates(f.owner,f.id,empty,pair)
    malformed={outcome:'conflict',conflict:{entity:'place',id:f.id,revision:1,current:{id:f.id,revision:1,name:'Museum',lat:'bad',lng:2},fields:['coordinates']}}
    await assert.rejects(syncArchive(f.owner,active),/coordinates conflict details/);malformed=undefined
    assert.equal((await store.listOperations(f.owner))[0].response,undefined)
    let activeOwner=true;const originalFetch=globalThis.fetch
    globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);activeOwner=false;return response}
    assert.equal((await syncArchive(f.owner,{isActiveOwner:()=>activeOwner})).status,'locked')
    assert.equal((await store.listOperations(f.owner))[0].response,undefined);globalThis.fetch=originalFetch;activeOwner=true
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
    await store.savePlaceCoordinates(f.owner,f.id,pair,next)
    await db.delete(schema.places).where(orm.eq(schema.places.id,f.id))
    assert.equal((await syncArchive(f.owner,active)).status,'conflict');const r=await review(f)
    assert.equal(r.remote,null);assert.deepEqual(placeCoordinates(r.local),next)
    await assert.rejects(store.resolvePlaceCoordinates(f.owner,f.id,r.token,{coordinates:pair}),/cannot be retried/)
    await store.resolvePlaceCoordinates(f.owner,f.id,r.token,{discard:true});assert.equal((await store.listOperations(f.owner)).length,0)
    assert.equal((await server.applySyncMutation(f.owner,entry)).outcome,'applied')
  }
  console.log('5 malformed response/account-switch retention and deleted-place export/discard passed')
  {
    const f=await setup(),entry=await store.savePlaceCoordinates(f.owner,f.id,empty,pair)
    await pool.query(`create function coordinates_receipt_rollback() returns trigger language plpgsql as $$ begin raise exception 'coordinate rollback'; end $$`)
    await pool.query(`create trigger coordinates_receipt_rollback before insert on sync_operations for each row execute function coordinates_receipt_rollback()`)
    await assert.rejects(server.applySyncMutation(f.owner,entry));assert.deepEqual(placeCoordinates(await remote(f.owner)),empty)
    assert.equal((await pool.query('select 1 from sync_entities where owner_id=$1',[f.owner])).rowCount,0)
    await pool.query('drop trigger coordinates_receipt_rollback on sync_operations');await pool.query('drop function coordinates_receipt_rollback()')
    assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  {
    const f=await setup({lat:120,lng:200});await store.savePlaceCoordinates(f.owner,f.id,{lat:120,lng:200},pair)
    malformed={outcome:'rejected'};assert.equal((await syncArchive(f.owner,active)).status,'rejected');malformed=undefined
    const r=await review(f);assert.equal(r.rejected,true)
    await assert.rejects(store.resolvePlaceCoordinates(f.owner,f.id,r.token,{coordinates:next}),/cannot be retried/)
    await store.resolvePlaceCoordinates(f.owner,f.id,r.token,{discard:true});assert.deepEqual(placeCoordinates((await projected(f.owner)).places[0]),{lat:120,lng:200})
    await store.savePlaceCoordinates(f.owner,f.id,{lat:120,lng:200},pair);assert.equal((await syncArchive(f.owner,active)).status,'synced')
  }
  console.log('6 receipt failure rolls back both coordinates and revision; retry succeeds; legacy out-of-range baseline and rejected recovery passed')
  console.log('verify-place-coordinates: passed; actual IndexedDB, sync client/server and synthetic local PostgreSQL')
} finally { IDBObjectStore.prototype.add=originalAdd;await pool?.end();await admin.query(`drop database if exists ${database}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);await admin.end();rmSync(outdir,{recursive:true,force:true});console.log(`cleanup confirmed: ${database} absent`) }
