import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { Pool } = require('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const port = Number(process.env.CAPSULE_TEST_PG_PORT)
assert.ok(port, 'A disposable local PostgreSQL port is required')
const connection = { host: '/private/tmp', port, user: userInfo().username }
const admin = new Pool({ ...connection, database: 'postgres' }), database = `capture_file_${process.pid}`
let pool
function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: sandboxModule, exports: sandboxModule.exports, Date, URL, Response, SyntaxError,
    require: (name) => { assert.ok(name in dependencies, name); return dependencies[name] },
  })
  return sandboxModule.exports
}
try {
  await admin.query(`create database ${database}`)
  pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) {
    await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  }
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') })
  const db = drizzle(pool, { schema }), owner = 'filing-owner'
  await db.insert(schema.users).values([{ id: owner }, { id: 'other' }])
  const [batch] = await db.insert(schema.intakeBatches).values({ ownerId: owner }).returning()
  async function seed() {
    const [item] = await db.insert(schema.intakeItems).values({ batchId: batch.id, originalUrl: `https://private/intake/${owner}/${randomUUID()}.jpg`, status: 'uploaded' }).returning()
    return item.id
  }
  let derives = 0, allowance = true, duringDerive = async () => {}
  const removed = []
  const geometry = load('src/lib/crop-geometry.ts', {})
  const warp = load('src/server/warp.ts', { 'server-only': {}, '@/lib/crop-geometry': geometry, '../lib/crop-geometry': geometry })
  const deps = {
    'server-only': {}, 'drizzle-orm': orm,
    './blob': { assertOwnedOriginalUrl: (id, url) => assert.ok(url.startsWith(`https://private/intake/${id}/`)), deleteBlobs: async (urls) => removed.push(...(urls.media ?? []).filter(Boolean)), thumbBesideCutout: () => null },
    './warp': warp, '@/design/silhouettes': load('src/design/silhouettes.ts', {}),
    './limits': { consume: async () => ({ ok: allowance }) },
    './derive': { deriveFromOriginal: async () => {
      const id = ++derives
      await duringDerive()
      return { cutoutUrl: `https://media/cut-${id}.webp`, thumbUrl: `https://media/thumb-${id}.webp`, width: 200, height: 300 }
    } },
    './db/pool': { getTxDb: () => db }, './db/schema': schema,
    './objects': load('src/server/objects.ts', { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema, './people': {}, './taxonomy': {} }),
  }
  const filing = load('src/server/capture-filing.ts', deps)
  const draft = { title: 'Ticket', kind: 'ticket_stub', receivedAt: '2026-09-06', place: 'Here', occasion: 'Trip', givenBy: 'Ada Lovelace', tags: ['Paper', 'paper', '  '], story: 'Story', corners: null }
  const itemId = await seed()
  const [a, b] = await Promise.all([filing.fileCapturedItem(owner, itemId, draft), filing.fileCapturedItem(owner, itemId, draft)])
  assert.equal(a.objectId, b.objectId)
  assert.equal((await db.select().from(schema.objects)).length, 1)
  const [face] = await db.select().from(schema.objectFaces)
  assert.ok(!removed.includes(face.cutoutUrl)); assert.ok(removed.length >= 2, 'discard unused duplicate derivatives')
  assert.equal((await db.select().from(schema.tags)).length, 1)
  assert.equal((await db.select().from(schema.objectTags)).length, 1)
  assert.equal((await db.select().from(schema.people))[0].initials, 'AL')
  assert.equal((await db.select().from(schema.objects))[0].silhouette, 'ticket')
  await db.update(schema.objects).set({ title: 'Later' }).where(orm.eq(schema.objects.id, a.objectId))
  const beforeRetry = derives
  const retry = await filing.fileCapturedItem(owner, itemId, Object.fromEntries(Object.entries(draft).reverse()))
  assert.equal(retry.objectId, a.objectId); assert.equal(derives, beforeRetry)
  assert.equal((await db.select().from(schema.objects))[0].title, 'Later')
  await assert.rejects(filing.fileCapturedItem(owner, itemId, { ...draft, title: 'Changed' }), filing.CaptureFilingConflictError)
  console.log('PASS concurrent filing, canonical replay, metadata, and later online edits')

  const blank = { title: '', kind: '', receivedAt: '', place: ' ', occasion: '', givenBy: '', tags: [], story: '', corners: null }
  const blankResult = await filing.fileCapturedItem(owner, await seed(), blank)
  const [blankObject] = await db.select().from(schema.objects).where(orm.eq(schema.objects.id, blankResult.objectId))
  assert.equal(blankObject.title, 'Untitled'); assert.equal(blankObject.receivedAt, null); assert.equal(blankObject.placeId, null)
  for (const patch of [
    { title: 7 }, { title: 'x'.repeat(251) }, { tags: ['x'.repeat(101)] }, { receivedAt: '2026-02-30' },
    { corners: false }, { corners: undefined }, { corners: [{ x: 0, y: 0 }] },
    { corners: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
    { corners: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
    { corners: [{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
  ]) assert.throws(() => filing.assertCaptureDraft({ ...draft, ...patch }), filing.CaptureFilingInputError)
  const beforeForeign = derives
  await assert.rejects(filing.fileCapturedItem('other', itemId, draft), filing.CaptureFilingInputError)
  assert.equal(derives, beforeForeign)
  console.log('PASS optional filing fields, invalid crops/dates, and owner isolation')

  const raceId = await seed(), beforeObjects = (await db.select().from(schema.objects)).length
  const beforeTaxonomy = (await db.select().from(schema.places)).length
  duringDerive = () => db.update(schema.intakeItems).set({ status: 'skipped', updatedAt: new Date(Date.now() + 2000) }).where(orm.eq(schema.intakeItems.id, raceId))
  await assert.rejects(filing.fileCapturedItem(owner, raceId, { ...draft, place: 'Must not appear' }), filing.CaptureFilingConflictError)
  assert.equal((await db.select().from(schema.objects)).length, beforeObjects)
  assert.equal((await db.select().from(schema.places)).length, beforeTaxonomy)
  assert.ok(removed.includes(`https://media/cut-${derives}.webp`))
  duringDerive = async () => {}
  await pool.query(`create function reject_face() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$; create trigger reject_face before insert on object_faces for each row execute function reject_face()`)
  const rollbackId = await seed()
  await assert.rejects(filing.fileCapturedItem(owner, rollbackId, { ...draft, place: 'Rolled back place' }))
  assert.equal((await db.select().from(schema.objects)).length, beforeObjects)
  assert.equal((await db.select().from(schema.places)).length, beforeTaxonomy)
  assert.equal((await db.select().from(schema.intakeItems).where(orm.eq(schema.intakeItems.id, rollbackId)))[0].objectId, null)
  await pool.query('drop trigger reject_face on object_faces; drop function reject_face()')
  assert.equal((await filing.fileCapturedItem(owner, rollbackId, draft)).lotNo, 3)
  console.log('PASS concurrent edit conflict and atomic rollback preserve metadata and lots')

  const routeFor = (user) => load('src/app/api/capture/file/route.ts', { '@/server/auth': { getCurrentUser: async () => user }, '@/server/capture-filing': filing })
  const request = (body, expectedOwner = owner) => new Request('https://capsule.test/api/capture/file', { method: 'POST', headers: { 'x-capsule-owner': expectedOwner }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const route = routeFor({ id: owner })
  assert.equal((await routeFor(null).POST(request({}))).status, 401)
  assert.equal((await route.POST(request({}, 'other'))).status, 409)
  for (const body of ['{', 'null', { itemId: 'bad', draft }, { itemId, draft: null }]) assert.equal((await route.POST(request(body))).status, 400)
  const ok = await route.POST(request({ itemId, draft }))
  assert.equal(ok.status, 200); assert.match(ok.headers.get('Cache-Control'), /no-store/)
  assert.equal((await route.POST(request({ itemId, draft: { ...draft, title: 'Changed' } }))).status, 409)
  allowance = false
  assert.equal((await route.POST(request({ itemId: await seed(), draft }))).status, 429)
  console.log('PASS route authentication, malformed requests, no-store replies, and rate limit')
  console.log('verify-capture-filing: passed')
} finally { await pool?.end(); await admin.query(`drop database if exists ${database}`); await admin.end() }
