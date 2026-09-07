import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { Pool } = require('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const port = Number(process.env.CAPSULE_TEST_PG_PORT); assert.ok(port)
const connection = { host: process.env.CAPSULE_TEST_PG_SOCKET ?? '/private/tmp', port, user: userInfo().username }, admin = new Pool({ ...connection, database: 'postgres' })
const database = `capsule_capture_${process.pid}`; let pool
function load(file, dependencies) { const sandboxModule = { exports: {} }; vm.runInNewContext(transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: sandboxModule, exports: sandboxModule.exports, Date, URL, Response, require(name) { assert.ok(name in dependencies, `Unexpected ${name}`); return dependencies[name] } }); return sandboxModule.exports }
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }); const db = drizzle(pool, { schema })
  class BlobNotFoundError extends Error {}
  let mode = 'present', seen = []
  const blob = { BlobNotFoundError, head: async (path) => { seen.push(path); if (mode === 'missing') throw new BlobNotFoundError(); if (mode === 'broken') throw new Error('network'); return { url: mode === 'wrong-path' ? 'https://store.private.blob.vercel-storage.com/other' : `https://store.private.blob.vercel-storage.com/${path}` } } }
  const capture = load('src/server/capture.ts', { 'server-only': {}, './capture-original': {}, '@vercel/blob': blob, 'drizzle-orm': orm, '@/lib/blob-path': load('src/lib/blob-path.ts', {}), './blob': { originalsToken: () => 'token', assertOwnedOriginalUrl: (_owner, url) => { if (!url.includes('store.private')) throw new Error('host'); return url } }, './db/pool': { getTxDb: () => db }, './db/schema': schema })
  const owner = 'capture-owner', id = randomUUID(), name = 'photo.jpg'; await db.insert(schema.users).values({ id: owner })
  mode = 'missing'; assert.equal(JSON.stringify(await capture.captureStatus(owner, id, name)), JSON.stringify({ status: 'missing' })); assert.equal((await db.select().from(schema.intakeItems)).length, 0)
  mode = 'present'; assert.equal(JSON.stringify(await capture.captureStatus(owner, id, name)), JSON.stringify({ status: 'uploaded' })); assert.equal((await db.select().from(schema.intakeItems)).length, 0)
  const exif = { taken: '2026-09-06', lat: 1, lng: 2 }; const [first, second] = await Promise.all([capture.finishCapture(owner, id, name, exif), capture.finishCapture(owner, id, name, exif)])
  assert.equal(first.status, 'recorded'); assert.equal(second.itemId, id); assert.equal((await db.select().from(schema.intakeItems)).length, 1); assert.equal((await db.select().from(schema.intakeBatches)).length, 1)
  const [item] = await db.select().from(schema.intakeItems); assert.equal(item.suggestions.date.value, exif.taken); assert.equal((await capture.finishCapture(owner, id, name)).itemId, id)
  mode = 'broken'; await assert.rejects(capture.captureStatus(owner, randomUUID(), name), /network/)
  mode = 'wrong-path'; await assert.rejects(capture.captureStatus(owner, randomUUID(), name), /path mismatch/); mode = 'present'
  for (const bad of [[randomUUID(), '../x.jpg'], ['nope', name]]) assert.throws(() => capture.assertCaptureInput(bad[0], bad[1]))
  const routeFor = (user) => load('src/app/api/capture/route.ts', { '@/server/auth': { getCurrentUser: async () => user }, '@/server/capture': capture })
  const request = (ownerHeader) => new Request('https://capsule.test/api/capture', { method: 'POST', headers: ownerHeader ? { 'x-capsule-owner': ownerHeader } : {}, body: '{}' })
  const heads = seen.length
  assert.equal((await routeFor(null).POST(request(owner))).status, 401)
  assert.equal((await routeFor({ id: owner }).POST(request('other'))).status, 409)
  assert.equal(seen.length, heads)
  const upload = load('src/server/blob-upload.ts', { 'server-only': {}, './blob': { MAX_ORIGINAL_BYTES: 1 }, '@/lib/blob-path': load('src/lib/blob-path.ts', {}) }); const token = upload.intakeTokenOptions(owner)
  assert.equal((await token(`intake/${owner}/legacy.jpg`)).addRandomSuffix, true); const capturePath = `intake/${owner}/captures/${randomUUID()}/photo.jpg`; const options = await token(capturePath); assert.equal(options.addRandomSuffix, false); assert.equal(options.allowOverwrite, false); await assert.rejects(token(`intake/${owner}/captures/${randomUUID()}/../x.jpg`))
  console.log('verify-capture: passed')
} finally { await pool?.end(); await admin.query(`drop database if exists ${database}`); await admin.end() }
