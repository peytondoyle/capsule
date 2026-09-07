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
const admin = new Pool({ ...connection, database: 'postgres' }), database = `face_${process.pid}`
let pool
function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: sandboxModule, exports: sandboxModule.exports, Date, URL, Response, SyntaxError, require: (name) => { assert.ok(name in dependencies, name); return dependencies[name] } })
  return sandboxModule.exports
}
try {
  await admin.query(`create database ${database}`)
  pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') })
  const db = drizzle(pool, { schema }), owner = 'face-owner', other = 'other'
  await db.insert(schema.users).values([{ id: owner }, { id: other }])
  const [object] = await db.insert(schema.objects).values({ ownerId: owner, lotNo: 1, title: 'Object' }).returning()
  const [batch] = await db.insert(schema.intakeBatches).values({ ownerId: owner }).returning()
  const item = async (originalUrl = `https://private/intake/${owner}/${randomUUID()}.jpg`) => (await db.insert(schema.intakeItems).values({ batchId: batch.id, originalUrl, status: 'uploaded' }).returning())[0]
  let derives = 0, allowance = true, duringDerive = async () => {}
  const removed = []
  const faceDraft = load('src/lib/face-draft.ts', {})
  const geometry = load('src/lib/crop-geometry.ts', {})
  const face = load('src/server/capture-face.ts', {
    'server-only': {}, 'drizzle-orm': orm, '@/lib/face-draft': faceDraft, '@/lib/crop-geometry': geometry,
    './blob': { assertOwnedOriginalUrl: () => {}, deleteBlobs: async (urls) => removed.push(...(urls.media ?? []).filter(Boolean)) },
    './derive': { deriveFromOriginal: async () => { const id = ++derives; await duringDerive(); return { cutoutUrl: `cut-${id}`, thumbUrl: `thumb-${id}`, width: 1, height: 2 } } },
    './limits': { consume: async () => ({ ok: allowance }) }, './db/pool': { getTxDb: () => db }, './db/schema': schema,
  })
  const saveRequest = (itemId, target) => ({ itemId, corners: null, target: { operationId: randomUUID(), objectId: object.id, faceId: target.faceId ?? randomUUID(), role: target.role ?? 'verso', action: target.action ?? 'save', base: target.base ?? null } })
  const firstItem = await item(), first = saveRequest(firstItem.id, {})
  const receipt = await face.saveCapturedFace(owner, first)
  assert.equal(receipt.deleted, false); assert.equal((await db.select().from(schema.objectFaces)).length, 1); assert.equal((await face.saveCapturedFace(owner, first)).faceId, first.target.faceId); assert.equal(derives, 1)
  await assert.rejects(face.saveCapturedFace(other, first))
  await assert.rejects(face.saveCapturedFace(owner, { ...first, itemId: (await item()).id }), /operation changed/)
  console.log('PASS add, idempotent replay, owner isolation, and payload mismatch')
  const [existing] = await db.select().from(schema.objectFaces), replacementItem = await item()
  const replacement = saveRequest(replacementItem.id, { faceId: existing.id, role: existing.role, base: faceDraft.faceBaseline(existing) })
  await face.saveCapturedFace(owner, replacement)
  const [replaced] = await db.select().from(schema.objectFaces).where(orm.eq(schema.objectFaces.id, existing.id))
  assert.equal(replaced.originalUrl, replacementItem.originalUrl); assert.equal(replaced.cutoutUrl, 'cut-2')
  const deletion = saveRequest(undefined, { faceId: existing.id, role: existing.role, action: 'delete', base: faceDraft.faceBaseline(replaced) })
  assert.equal((await face.saveCapturedFace(owner, deletion)).deleted, true); assert.equal((await db.select().from(schema.objectFaces)).length, 0)
  await assert.rejects(face.saveCapturedFace(owner, saveRequest((await item()).id, { faceId: existing.id })), /photograph changed/)
  console.log('PASS replace, delete, tombstone, and no resurrection')
  const invalidItem = await item()
  await assert.rejects(face.saveCapturedFace(owner, { ...saveRequest(invalidItem.id, {}), corners: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }] }), face.FaceInputError)
  await assert.rejects(face.saveCapturedFace(owner, { ...saveRequest(invalidItem.id, {}), corners: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }), face.FaceInputError)
  const [otherBatch] = await db.insert(schema.intakeBatches).values({ ownerId: other }).returning(), [foreignItem] = await db.insert(schema.intakeItems).values({ batchId: otherBatch.id, originalUrl: `https://private/intake/${other}/${randomUUID()}.jpg`, status: 'uploaded' }).returning()
  await assert.rejects(face.saveCapturedFace(owner, saveRequest(foreignItem.id, {})), face.FaceInputError)
  allowance = false
  await assert.rejects(face.saveCapturedFace(owner, saveRequest((await item()).id, {})), face.FaceLimitError)
  allowance = true
  console.log('PASS concave and out-of-range crops, foreign sources, and limits')
  const conflictItem = await item(), conflictFace = randomUUID()
  await db.insert(schema.objectFaces).values({ id: randomUUID(), objectId: object.id, role: 'recto', originalUrl: 'old', cutoutUrl: 'old-cut', thumbUrl: 'old-thumb', width: 1, height: 1 })
  const before = derives
  await assert.rejects(face.saveCapturedFace(owner, saveRequest(conflictItem.id, { faceId: conflictFace, role: 'recto' })), /photograph changed/); assert.equal(derives, before)
  await db.delete(schema.objectFaces).where(orm.eq(schema.objectFaces.objectId, object.id))
  const raceAItem = await item(), raceBItem = await item(), raceA = saveRequest(raceAItem.id, { faceId: randomUUID(), role: 'verso' }), raceB = saveRequest(raceBItem.id, { faceId: randomUUID(), role: 'verso' })
  let release, reached = 0; const gate = new Promise(resolve => { release = resolve }); duringDerive = () => { reached++; return reached === 2 ? (release(), gate) : gate }
  const outcomes = await Promise.allSettled([face.saveCapturedFace(owner, raceA), face.saveCapturedFace(owner, raceB)])
  assert.equal(reached, 2); assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1); assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1); assert.equal((await db.select().from(schema.objectFaces).where(orm.eq(schema.objectFaces.role, 'verso'))).length, 1); duringDerive = async () => {}
  console.log('PASS pre-derive conflict and simultaneous add-back conflict')
  const changedItem = await item(), changed = saveRequest(changedItem.id, { faceId: randomUUID(), role: 'detail' })
  duringDerive = () => db.update(schema.intakeItems).set({ status: 'skipped', updatedAt: new Date(Date.now() + 2000) }).where(orm.eq(schema.intakeItems.id, changedItem.id))
  await assert.rejects(face.saveCapturedFace(owner, changed), /photograph changed/); assert.ok(removed.includes(`cut-${derives}`)); duringDerive = async () => {}
  const skippedItem = await item()
  await db.update(schema.intakeItems).set({ status: 'skipped' }).where(orm.eq(schema.intakeItems.id, skippedItem.id))
  const skippedRequest = saveRequest(skippedItem.id, { faceId: randomUUID(), role: 'detail' }), beforeSkipped = derives
  await assert.rejects(face.saveCapturedFace(owner, skippedRequest), error => error instanceof face.FaceConflictError && error.conflict.sourceChanged === true)
  assert.equal(derives, beforeSkipped)
  const retryItem = await item(skippedItem.originalUrl), retry = saveRequest(retryItem.id, { faceId: skippedRequest.target.faceId, role: 'detail' })
  await face.saveCapturedFace(owner, retry)
  assert.equal((await db.select().from(schema.objectFaces).where(orm.eq(schema.objectFaces.id, retry.target.faceId))).length, 1)
  console.log('PASS source conflicts before/during derive, retry with replacement source, and derivative cleanup')

  const [target] = await db.select().from(schema.objectFaces).where(orm.eq(schema.objectFaces.id, retry.target.faceId)), editItem = await item()
  const edit = saveRequest(editItem.id, { faceId: target.id, role: target.role, base: faceDraft.faceBaseline(target) }), beforeEdit = derives
  let editRelease; const editGate = new Promise(resolve => { editRelease = resolve }); duringDerive = () => editGate
  const editResult = face.saveCapturedFace(owner, edit)
  await new Promise(resolve => setTimeout(resolve, 20))
  await db.update(schema.objectFaces).set({ cutoutUrl: 'edited-online' }).where(orm.eq(schema.objectFaces.id, target.id)); editRelease()
  await assert.rejects(editResult, error => error instanceof face.FaceConflictError && error.conflict.sourceChanged !== true)
  assert.equal(derives, beforeEdit + 1); assert.ok(removed.includes(`cut-${derives}`)); duringDerive = async () => {}
  console.log('PASS concurrent target edit conflict and cleanup of newly derived media')
  await pool.query(`create function reject_sync() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$; create trigger reject_sync after insert on sync_operations for each row execute function reject_sync()`)
  const rollbackItem = await item(), rollback = saveRequest(rollbackItem.id, { faceId: randomUUID(), role: 'detail' }), beforeRollback = (await db.select().from(schema.objects)).length, beforeFaces = (await db.select().from(schema.objectFaces)).length
  const beforeIntake = (await db.select().from(schema.intakeItems)).length, beforeEntities = (await db.select().from(schema.syncEntities)).length, beforeOps = (await db.select().from(schema.syncOperations)).length
  await assert.rejects(face.saveCapturedFace(owner, rollback)); assert.equal((await db.select().from(schema.objectFaces)).length, beforeFaces); assert.equal((await db.select().from(schema.objects)).length, beforeRollback); assert.equal((await db.select().from(schema.intakeItems)).length, beforeIntake); assert.equal((await db.select().from(schema.syncEntities)).length, beforeEntities); assert.equal((await db.select().from(schema.syncOperations)).length, beforeOps)
  assert.ok(!removed.includes(`cut-${derives}`), 'database errors retain derivatives for later cleanup')
  await pool.query('drop trigger reject_sync on sync_operations; drop function reject_sync()')
  console.log('PASS database rollback preserves face, intake, revisions, and receipt')
  const route = load('src/app/api/capture/face/route.ts', { '@/server/auth': { getCurrentUser: async () => ({ id: owner }) }, '@/server/capture-face': face, '@/lib/face-draft': faceDraft })
  const routeRequest = (body, stampedOwner = owner) => new Request('https://capsule.test/api/capture/face', { method: 'POST', headers: { 'x-capsule-owner': stampedOwner }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const unauthRoute = load('src/app/api/capture/face/route.ts', { '@/server/auth': { getCurrentUser: async () => null }, '@/server/capture-face': face, '@/lib/face-draft': faceDraft })
  assert.equal((await unauthRoute.POST(routeRequest({}))).status, 401)
  assert.equal((await route.POST(routeRequest({}, other))).status, 409)
  for (const body of ['{', 'null', {}, { target: {} }]) { const status = (await route.POST(routeRequest(body))).status; assert.equal(status, 400, JSON.stringify(body)) }
  const routeItem = await item(), routeBody = saveRequest(routeItem.id, { role: 'detail' })
  assert.equal((await route.POST(routeRequest(routeBody))).status, 200)
  assert.match((await route.POST(routeRequest(routeBody))).headers.get('cache-control'), /no-store/)
  console.log('PASS route authentication, malformed requests, and no-store response')
  const intake = load('src/server/intake.ts', { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/pool': { getTxDb: () => db }, './db/schema': schema, './objects': {}, './blob': {}, '@/design/silhouettes': {} })
  const backOriginal = `https://private/intake/${owner}/back-${randomUUID()}.jpg`, oldOriginal = `https://private/intake/${owner}/old-${randomUUID()}.jpg`
  const [back] = await db.insert(schema.objectFaces).values([{ objectId: object.id, role: 'verso', originalUrl: backOriginal, cutoutUrl: 'back-old', thumbUrl: 'back-thumb', width: 1, height: 1 }, { objectId: object.id, role: 'detail', originalUrl: oldOriginal, cutoutUrl: 'detail-old', thumbUrl: 'detail-thumb', width: 1, height: 1 }]).returning()
  const repaired = await intake.repairObjectFace(owner, object.id, { originalUrl: backOriginal, cutoutUrl: 'back-new', thumbUrl: 'back-new-thumb', width: 4, height: 5 })
  assert.equal(repaired.id, back.id); assert.equal((await db.select().from(schema.objectFaces).where(orm.eq(schema.objectFaces.originalUrl, oldOriginal)))[0].cutoutUrl, 'detail-old')
  assert.equal(await intake.repairObjectFace(owner, object.id, { originalUrl: `https://private/intake/${owner}/replaced.jpg`, cutoutUrl: 'ignored', thumbUrl: 'ignored', width: 9, height: 9 }), null)
  console.log('PASS owner-scoped back-face repair and replaced-source protection')
  console.log('verify-capture-face: passed')
} finally { await pool?.end(); await admin.query(`drop database if exists ${database}`); await admin.end() }
