import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo, tmpdir } from 'node:os'
import vm from 'node:vm'
import { build, buildSync, transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const runtimeRequire = createRequire(`${process.env.OFFLINE_RUNTIME}/package.json`)
const { Pool } = runtimeRequire('pg'), { drizzle } = require('drizzle-orm/node-postgres'), orm = require('drizzle-orm')
Object.assign(globalThis, runtimeRequire('fake-indexeddb'))
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, run) => run({}) } }, configurable: true })
const connection = { host: process.env.CAPSULE_TEST_PG_SOCKET, port: Number(process.env.CAPSULE_TEST_PG_PORT), user: userInfo().username }
assert.ok(connection.host && connection.port)
const admin = new Pool({ ...connection, database: 'postgres' }), database = `capsule_heic_${process.pid}`
const outdir = mkdtempSync(`${tmpdir()}/capsule-heic-`)
let pool
function load(file, dependencies) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: sandboxModule, exports: sandboxModule.exports, Date, URL, Response, fetch: (...args) => globalThis.blobFetch(...args), require(name) { assert.ok(name in dependencies, `Unexpected ${name}`); return dependencies[name] } })
  return sandboxModule.exports
}
const plain = value => JSON.parse(JSON.stringify(value))
const digest = bytes => ({ size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
const camera = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 255, 34, 10, 128])
const jpeg = Buffer.from('processing JPEG bytes')
const blobs = new Map(), writes = [], reads = []
let loseUpload = false, loseFinish = false, active = true, changeOnRead = false, malformed = false, failRaw = false
class BlobNotFoundError extends Error {}
const paths = load('src/lib/blob-path.ts', {})
const blob = { BlobNotFoundError, head: async path => {
  reads.push(path)
  if (!blobs.has(path)) throw new BlobNotFoundError()
  return { url: `https://fixture.private.blob.vercel-storage.com/${path}` }
} }
const storage = { MAX_ORIGINAL_BYTES: 50 * 1024 * 1024, originalsToken: () => 'fixture-only', assertOwnedOriginalUrl: (owner, value) => {
  const url = new URL(value)
  assert.equal(url.origin, 'https://fixture.private.blob.vercel-storage.com')
  assert.ok(url.pathname.startsWith(`/intake/${owner}/`) && !url.pathname.includes('%'))
  return value
} }
globalThis.blobFetch = async (url, options) => {
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store')
  assert.equal(options.headers.authorization, 'Bearer fixture-only')
  if (changeOnRead) active = false
  const bytes = blobs.get(new URL(url).pathname.slice(1))
  return new Response(bytes, { status: bytes ? 200 : 404 })
}
try {
  await admin.query(`create database ${database}`); pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator', '0007_sync-foundation']) await pool.query(readFileSync(`drizzle/${name}.sql`, 'utf8'))
  const schema = load('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': require('drizzle-orm/pg-core') }), db = drizzle(pool, { schema })
  const original = load('src/server/capture-original.ts', { 'server-only': {}, 'node:crypto': { createHash }, '@vercel/blob': blob, '@/lib/blob-path': paths, './blob': storage })
  const capture = load('src/server/capture.ts', { 'server-only': {}, '@vercel/blob': blob, 'drizzle-orm': orm, '@/lib/blob-path': paths, './blob': storage, './capture-original': original, './db/pool': { getTxDb: () => db }, './db/schema': schema })
  const route = owner => load('src/app/api/capture/route.ts', { '@/server/auth': { getCurrentUser: async () => owner ? { id: owner } : null }, '@/server/capture': capture })
  const download = owner => load('src/app/api/capture/[captureId]/original/route.ts', { '@/server/auth': { getCurrentUser: async () => owner ? { id: owner } : null }, '@/server/capture': capture })
  const tokenOptions = load('src/server/blob-upload.ts', { 'server-only': {}, './blob': storage, '@/lib/blob-path': paths }).intakeTokenOptions
  const token = await tokenOptions('owner')(paths.clientCaptureOriginalPath('owner', randomUUID()))
  assert.equal(token.allowOverwrite, false); assert.equal(token.addRandomSuffix, false)
  for (const bad of ['intake/foreign/captures/123/camera-original/original.heic', 'intake/owner/captures/../camera-original/original.heic', 'intake/owner/captures/%2f/camera-original/original.heic']) await assert.rejects(tokenOptions('owner')(bad))
  globalThis.testUpload = async (path, bytes, options) => {
    const owner = path.split('/')[1], permission = await tokenOptions(owner)(path)
    assert.equal(permission.allowOverwrite, false); assert.equal(permission.addRandomSuffix, false)
    assert.equal(options.access, 'private')
    if (failRaw && path.includes('/camera-original/')) throw new Error('backup transport failed')
    assert.equal(blobs.has(path), false, 'no overwrite attempt')
    const stored = Buffer.from(await bytes.arrayBuffer()); blobs.set(path, stored); writes.push(path)
    if (loseUpload && path.includes('/camera-original/')) { loseUpload = false; throw new Error('lost upload response') }
    return { url: `https://fixture.private.blob.vercel-storage.com/${path}` }
  }
  globalThis.createImageBitmap = async () => ({ width: 2, height: 2, close() {} })
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: run => run(new Blob([jpeg], { type: 'image/jpeg' })) }) }
  await build({ entryPoints: ['src/lib/capture-sync.ts'], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/sync.mjs`, plugins: [{ name: 'blob-transport', setup(build) {
    build.onResolve({ filter: /^@vercel\/blob\/client$/ }, ({ path }) => ({ path, namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const upload = (...args) => globalThis.testUpload(...args)' }))
  } }] })
  buildSync({ entryPoints: ['src/lib/offline-queue.ts'], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/queue.mjs` })
  const { drainCaptures } = await import(`${outdir}/sync.mjs`), queue = await import(`${outdir}/queue.mjs`)
  const progress = [], options = { isActiveOwner: () => active, onProgress: value => progress.push(value) }
  let filingCalls = 0
  globalThis.fetch = async (url, init) => {
    if (url !== '/api/capture') { filingCalls++; return Response.json({}) }
    const body = JSON.parse(init.body), owner = init.headers['x-capsule-owner']
    const result = await route(owner).POST(new Request('https://capsule.test/api/capture', init))
    if (loseFinish && body.action === 'finish' && result.ok) { loseFinish = false; throw new Error('lost finish reply') }
    if (malformed && body.original) return Response.json({ status: 'recorded', itemId: body.captureId, original: { ...body.original, sha256: '0'.repeat(64) } })
    return result
  }
  const add = async owner => { await db.insert(schema.users).values({ id: owner }); return queue.enqueueUpload(owner, new File([camera], 'camera.HEIC', { type: 'image/heic' })) }
  const getDownload = (owner, captureId) => download(owner).GET(new Request('https://capsule.test/download'), { params: Promise.resolve({ captureId }) })

  await add('roundtrip'); await drainCaptures('roundtrip', options)
  const [saved] = await queue.listRetainedOriginals('roundtrip')
  assert.ok(saved.originalBackup); assert.equal((await queue.listQueued('roundtrip')).length, 0)
  assert.deepEqual(plain(saved.originalBackup), { ...digest(camera), captureId: saved.itemId })
  assert.deepEqual(Buffer.from(await saved.bytes.arrayBuffer()), camera)
  assert.deepEqual(blobs.get(paths.clientCapturePath('roundtrip', saved.itemId, 'camera.jpg')), jpeg)
  assert.deepEqual(blobs.get(paths.clientCaptureOriginalPath('roundtrip', saved.itemId)), camera)
  const response = await getDownload('roundtrip', saved.itemId)
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.match(response.headers.get('content-disposition'), /attachment/)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), camera)
  const before = reads.length
  for (const owner of [null, 'foreign']) assert.equal((await getDownload(owner, saved.itemId)).status, owner ? 404 : 401)
  assert.equal(reads.length, before, 'unauthorized/foreign download makes no Blob call')
  console.log('1 byte-identical original upload/download, separate JPEG, durable receipt and owner isolation passed')

  const writeCount = writes.length; await drainCaptures('roundtrip', options); assert.equal(writes.length, writeCount)
  for (const owner of ['lost-upload', 'lost-finish']) {
    await add(owner); loseUpload = owner === 'lost-upload'; loseFinish = owner === 'lost-finish'
    await drainCaptures(owner, options); await drainCaptures(owner, options)
    assert.equal((await queue.listQueued(owner)).length, 0)
    assert.equal(writes.filter(path => path.startsWith(`intake/${owner}/`)).length, 2)
  }
  console.log('2 lost upload/finish acknowledgement and replay make no duplicate writes')

  await add('missing'); failRaw = true; await drainCaptures('missing', options); failRaw = false
  assert.equal((await queue.listQueued('missing')).length, 1)
  assert.equal((await queue.listRetainedOriginals('missing')).length, 0)
  await drainCaptures('missing', options); assert.ok((await queue.listRetainedOriginals('missing'))[0].originalBackup)
  await add('mismatch')
  malformed = true; await drainCaptures('mismatch', options); malformed = false
  assert.equal((await queue.listQueued('mismatch')).length, 1)
  const [bad] = await queue.listQueued('mismatch'), rawPath = paths.clientCaptureOriginalPath('mismatch', bad.prepared.captureId)
  blobs.set(rawPath, Buffer.alloc(camera.length, 9))
  const beforeMismatch = writes.length; await drainCaptures('mismatch', options)
  assert.equal((await queue.listQueued('mismatch')).length, 1); assert.equal(writes.length, beforeMismatch)
  assert.deepEqual(Buffer.from(await (await queue.listQueued('mismatch'))[0].bytes.arrayBuffer()), camera)
  console.log('3 missing/malformed/mismatched backups retain original and never overwrite')

  for (const owner of ['retained', 'retained-face']) {
    const key = await add(owner), captureId = randomUUID()
    await queue.prepareUpload(owner, key, { captureId, name: 'camera.jpg', type: 'image/jpeg', bytes: new Blob([jpeg]), converted: true })
    blobs.set(paths.clientCapturePath(owner, captureId, 'camera.jpg'), jpeg)
    await capture.finishCapture(owner, captureId, 'camera.jpg')
    await queue.acknowledgeUpload(owner, key, captureId)
    if (owner === 'retained-face') {
      const idb = await new Promise(resolve => { const req = indexedDB.open('capsule-offline'); req.onsuccess = () => resolve(req.result) })
      await new Promise((resolve, reject) => { const tx = idb.transaction('pending-uploads', 'readwrite'), store = tx.objectStore('pending-uploads'), get = store.get(key); get.onsuccess = () => store.put({ ...get.result, faceTarget: { action: 'save' } }); tx.oncomplete = resolve; tx.onabort = reject }); idb.close()
    }
    const calls = filingCalls
    await drainCaptures(owner, { ...options, kind: owner === 'retained-face' ? 'faces' : 'captures' })
    const [backed] = await queue.listRetainedOriginals(owner)
    assert.ok(backed.originalBackup); assert.equal(backed.itemId, captureId); assert.equal(filingCalls, calls)
    assert.deepEqual(Buffer.from(await (await getDownload(owner, captureId)).arrayBuffer()), camera)
  }
  console.log('4 retained captures and face copies backfill without refiling or replacing JPEG')

  await add('switch'); changeOnRead = true
  const [switched] = await queue.listQueued('switch')
  const captureId = randomUUID(); await queue.prepareUpload('switch', switched.key, { captureId, name: 'camera.jpg', type: 'image/jpeg', bytes: new Blob([jpeg]), converted: true })
  blobs.set(paths.clientCaptureOriginalPath('switch', captureId), camera)
  assert.equal(await drainCaptures('switch', options), 'locked'); changeOnRead = false; active = true
  assert.equal((await queue.listQueued('switch')).length, 1); assert.equal((await queue.listQueued('switch'))[0].originalBackup, undefined)
  for (const value of [{ size: 0, sha256: digest(camera).sha256 }, { size: camera.length, sha256: 'bad' }, null, { size: 999999999, sha256: digest(camera).sha256 }]) assert.throws(() => capture.assertCaptureInput(randomUUID(), 'camera.jpg', undefined, value))
  const missingId = randomUUID(); blobs.set(paths.clientCapturePath('roundtrip', missingId, 'camera.jpg'), jpeg)
  assert.equal((await capture.finishCapture('roundtrip', missingId, 'camera.jpg', undefined, digest(camera))).status, 'uploaded')
  assert.equal((await db.select().from(schema.intakeItems).where(orm.eq(schema.intakeItems.id, missingId))).length, 0)
  console.log('5 account-switch, invalid descriptors and unconfirmed raw prevent acknowledgement/recording')
  console.log('verify-heic-backup: passed; all Blob operations used in-memory transports; no live Blob call')
} finally {
  await pool?.end(); await admin.query(`drop database if exists ${database}`)
  assert.equal((await admin.query('select 1 from pg_database where datname=$1', [database])).rowCount, 0)
  await admin.end(); rmSync(outdir, { recursive: true, force: true })
  console.log(`cleanup confirmed: ${database} absent`)
}
