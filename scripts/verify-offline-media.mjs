import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { Pool } = require('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
const port = Number(process.env.CAPSULE_TEST_PG_PORT)
assert.ok(port, 'Use the disposable local database')
const connection = { host: '/private/tmp', port, user: userInfo().username }
const admin = new Pool({ ...connection, database: 'postgres' }), database = `offline_media_${process.pid}`
let pool, requests = [], mode = 'ok'
const testEnv = { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_media_secret', BLOB_ORIGINALS_READ_WRITE_TOKEN: 'vercel_blob_rw_originals_secret' }
function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: sandboxModule, exports: sandboxModule.exports, Date, URL, Response, process: { env: testEnv },
    fetch: async (url, options) => { requests.push({ url, options }); if (mode === 'network') throw new Error('secret transport detail'); return new Response(mode === 'ok' ? 'image bytes' : null, { status: mode === 'ok' ? 200 : 404, headers: { 'content-type': 'image/jpeg' } }) },
    require: (name) => { assert.ok(name in dependencies, name); return dependencies[name] },
  })
  return sandboxModule.exports
}
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') })
  const db = drizzle(pool, { schema }), owner = 'alice'
  await db.insert(schema.users).values([{ id: owner }, { id: 'bob' }])
  const [object] = await db.insert(schema.objects).values({ ownerId: owner, title: 'Original', lotNo: 1 }).returning()
  const original = 'https://originals.private.blob.vercel-storage.com/intake/alice/original.jpg'
  const publicUrl = 'https://media.public.blob.vercel-storage.com/intake/alice/cut.webp'
  const [face] = await db.insert(schema.objectFaces).values({ objectId: object.id, role: 'recto', originalUrl: original, cutoutUrl: publicUrl, maskUrl: publicUrl }).returning()
  const [batch] = await db.insert(schema.intakeBatches).values({ ownerId: owner }).returning()
  const [item] = await db.insert(schema.intakeItems).values({ batchId: batch.id, originalUrl: original, cutoutUrl: publicUrl }).returning()
  const api = load('src/server/offline-media.ts', { 'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db }, './db/schema': schema, './blob': load('src/server/blob.ts', { 'server-only': {} }) })
  const asset = { kind: 'face', id: face.id, variant: 'original', source: original }
  let response = await api.downloadArchiveMedia(owner, asset)
  assert.equal(response.status, 200); assert.equal(await response.text(), 'image bytes')
  assert.equal(response.headers.get('x-capsule-media-source'), original)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(requests.at(-1).options.headers.authorization, `Bearer ${testEnv.BLOB_ORIGINALS_READ_WRITE_TOKEN}`)
  assert.equal(requests.at(-1).options.redirect, 'error')
  for (const variant of ['cutout', 'mask']) {
    response = await api.downloadArchiveMedia(owner, { ...asset, variant, source: publicUrl })
    assert.equal(response.status, 200); assert.equal(requests.at(-1).options.headers, undefined)
  }
  assert.equal((await api.downloadArchiveMedia(owner, { ...asset, kind: 'intake', id: item.id })).status, 200)
  const before = requests.length
  assert.equal((await api.downloadArchiveMedia('bob', asset)).status, 404)
  assert.equal((await api.downloadArchiveMedia('bob', { ...asset, kind: 'intake', id: item.id })).status, 404)
  assert.equal((await api.downloadArchiveMedia(owner, { ...asset, source: 'https://evil.test' })).status, 409)
  assert.equal((await api.downloadArchiveMedia(owner, { ...asset, variant: 'thumb' })).status, 404)
  for (const patch of [{ kind: 'other' }, { id: 'bad' }, { variant: 'token' }, { source: '' }]) assert.equal((await api.downloadArchiveMedia(owner, { ...asset, ...patch })).status, 400)
  assert.equal(requests.length, before)
  console.log('PASS owner-scoped faces/intake, source version, originals auth, and public derivatives')

  for (const invalid of ['https://evil.test/intake/alice/cut.webp', 'https://media.public.blob.vercel-storage.com/intake/bob/cut.webp', 'https://media.public.blob.vercel-storage.com/intake/alice/%2e%2e/cut.webp']) {
    await db.update(schema.objectFaces).set({ cutoutUrl: invalid }).where(orm.eq(schema.objectFaces.id, face.id))
    assert.equal((await api.downloadArchiveMedia(owner, { ...asset, variant: 'cutout', source: invalid })).status, 404)
  }
  assert.equal(requests.length, before)
  mode = 'network'; response = await api.downloadArchiveMedia(owner, asset)
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('secret'))
  mode = 'missing'; assert.equal((await api.downloadArchiveMedia(owner, asset)).status, 502)
  console.log('PASS unsafe stored URLs and failed upstream responses never leak tokens')

  const route = (user) => load('src/app/api/offline-media/route.ts', { '@/server/auth': { getCurrentUser: async () => user }, '@/server/offline-media': api })
  const request = (header) => new Request(`https://capsule.test/api/offline-media?${new URLSearchParams(asset)}`, { headers: { 'x-capsule-owner': header } })
  assert.equal((await route(null).GET(request(owner))).status, 401)
  assert.equal((await route({ id: owner }).GET(request('bob'))).status, 409)
  mode = 'ok'; assert.equal((await route({ id: owner }).GET(request(owner))).status, 200)
  assert.equal((await route({ id: owner }).GET(new Request('https://capsule.test/api/offline-media', { headers: { 'x-capsule-owner': owner } }))).status, 400)
  console.log('verify-offline-media: passed')
} finally { await pool?.end(); await admin.query(`drop database if exists ${database}`); await admin.end() }
