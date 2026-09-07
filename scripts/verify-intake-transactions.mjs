// Local PostgreSQL only. Start a disposable cluster, then run with
// CAPSULE_TEST_PG_PORT=55439 NODE_PATH=/path/to/temporary/node_modules node scripts/verify-intake-transactions.mjs
// The temporary node_modules needs `pg`; the application dependencies are unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const loadPackage = createRequire(import.meta.url)
const { Pool } = loadPackage('pg')
const { drizzle } = loadPackage('drizzle-orm/node-postgres')
const orm = loadPackage('drizzle-orm')
const { eq } = orm
const connection = { host: '/private/tmp', port: Number(process.env.CAPSULE_TEST_PG_PORT), user: userInfo().username }
assert.ok(connection.port, 'CAPSULE_TEST_PG_PORT must name a disposable local PostgreSQL cluster')
const admin = new Pool({ ...connection, database: 'postgres' })
const database = `capsule_verify_${process.pid}`
let pool

function loadSource(file, dependencies) {
  const sandboxModule = { exports: {} }
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  vm.runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports, Date, Response,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  }, { filename: file })
  return sandboxModule.exports
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

try {
  await admin.query(`create database ${database}`)
  pool = new Pool({ ...connection, database })
  for (const name of ['0000_cute_jigsaw', '0001_enable_pg_trgm', '0002_tired_moondragon', '0003_fuzzy_martin_li', '0004_plain_black_bird', '0005_watery_quasimodo', '0006_daily_vindicator']) {
    await pool.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'))
  }
  const schema = loadSource('src/server/db/schema.ts', { 'drizzle-orm': orm, 'drizzle-orm/pg-core': loadPackage('drizzle-orm/pg-core') })
  const db = drizzle(pool, { schema })
  const dependencies = {
    'server-only': {}, 'drizzle-orm': orm, './db': { getDb: () => db },
    './db/pool': { getTxDb: () => db }, './db/schema': schema,
  }
  const objects = loadSource('src/server/objects.ts', { ...dependencies, './people': {}, './taxonomy': {} })
  const intake = loadSource('src/server/intake.ts', {
    ...dependencies, './objects': objects, './blob': {},
    '@/design/silhouettes': loadSource('src/design/silhouettes.ts', {}),
  })
  const ownerId = 'local-audit-owner'
  await db.insert(schema.users).values({ id: ownerId })
  const [batch] = await db.insert(schema.intakeBatches).values({ ownerId, source: 'files' }).returning()
  async function seed() {
    const [item] = await db.insert(schema.intakeItems).values({ batchId: batch.id, originalUrl: 'https://original.invalid/photo.jpg', status: 'uploaded' }).returning()
    return item
  }
  async function rows(itemId) {
    const item = await intake.getIntakeItem(ownerId, itemId)
    const [face] = await db.select().from(schema.objectFaces).where(eq(schema.objectFaces.objectId, item.objectId))
    return { item, face }
  }
  const image = { cutoutUrl: 'https://media.invalid/cutout-a.webp', thumbUrl: 'https://media.invalid/thumb-a.webp', width: 240, height: 120 }
  const file = (id) => intake.fileIntakeItem(ownerId, id, { title: 'Local proof' })

  const concurrent = await seed()
  const filed = await Promise.all(Array.from({ length: 8 }, () => file(concurrent.id)))
  assert.equal(new Set(filed.map((result) => result.objectId)).size, 1)
  assert.equal(filed.filter((result) => !result.alreadyFiled).length, 1)
  assert.equal((await db.select().from(schema.objects)).length, 1)
  assert.equal((await db.select().from(schema.objectFaces)).length, 1)
  console.log('PASS eight concurrent filings create one object, one face, one lot')

  const rollback = await seed()
  await pool.query(`create function reject_face() returns trigger language plpgsql as $$ begin raise exception 'injected face failure'; end $$;
    create trigger reject_face before insert on object_faces for each row execute function reject_face()`)
  await assert.rejects(file(rollback.id))
  assert.equal((await db.select().from(schema.objects)).length, 1)
  assert.equal((await intake.getIntakeItem(ownerId, rollback.id)).objectId, null)
  await pool.query('drop trigger reject_face on object_faces; drop function reject_face()')
  assert.equal((await file(rollback.id)).lotNo, 2)
  console.log('PASS face failure rolls back the object, lot allocation, and intake link')

  const race = await seed()
  const started = deferred()
  const release = deferred()
  const route = loadSource('src/app/api/derive/route.ts', {
    '@/server/auth': { getCurrentUser: async () => ({ id: ownerId }) },
    '@/server/limits': { consume: async () => ({ ok: true }) },
    '@/server/blob': { intakePath: () => 'intake/local/probe/', deleteBlobs: async () => {}, thumbBesideCutout: () => null },
    '@/server/derive': { deriveFromOriginal: async () => { started.resolve(); await release.promise; return image } },
    '@/server/intake': intake,
  })
  const processing = route.POST({ json: async () => ({ itemId: race.id }) })
  await started.promise
  await file(race.id)
  release.resolve()
  assert.equal((await processing).status, 200)
  const afterRace = await rows(race.id)
  for (const [key, value] of Object.entries(image)) assert.equal(afterRace.face[key], value)
  assert.equal(afterRace.item.status, 'filed')
  console.log('PASS actual derive route repairs an object filed during image processing')

  const staleStarted = deferred(), staleRelease = deferred(), removed = []
  const staleRoute = loadSource('src/app/api/derive/route.ts', {
    '@/server/auth': { getCurrentUser: async () => ({ id: ownerId }) },
    '@/server/limits': { consume: async () => ({ ok: true }) },
    '@/server/blob': { intakePath: () => 'intake/local/probe/', deleteBlobs: async (urls) => removed.push(...urls.media), thumbBesideCutout: () => null },
    '@/server/derive': { deriveFromOriginal: async () => { staleStarted.resolve(); await staleRelease.promise; return { ...image, cutoutUrl: 'https://media.invalid/stale.webp' } } },
    '@/server/intake': intake,
  })
  const stale = staleRoute.POST({ json: async () => ({ itemId: race.id }) })
  await staleStarted.promise
  await intake.updateIntakeItem(ownerId, race.id, { ...image, cutoutUrl: 'https://media.invalid/newer.webp', corners: [{ x: .2, y: .2 }] })
  staleRelease.resolve()
  assert.equal((await stale).status, 409)
  assert.equal((await rows(race.id)).face.cutoutUrl, 'https://media.invalid/newer.webp')
  assert.ok(removed.includes('https://media.invalid/stale.webp'))
  assert.ok(!removed.includes('https://media.invalid/newer.webp'))
  console.log('PASS delayed derive cannot overwrite a newer crop and removes only its own unused images')

  const early = await seed()
  await intake.updateIntakeItem(ownerId, early.id, { ...image, status: 'segmented' })
  await file(early.id)
  assert.equal((await rows(early.id)).face.cutoutUrl, image.cutoutUrl)
  console.log('PASS processing completed before filing supplies the same image')

  await Promise.all(Array.from({ length: 8 }, (_, i) => intake.updateIntakeItem(ownerId, race.id, {
    ...image, cutoutUrl: `https://media.invalid/cutout-${i}.webp`, thumbUrl: `https://media.invalid/thumb-${i}.webp`, status: 'segmented',
  })))
  const updated = await rows(race.id)
  assert.equal(updated.item.cutoutUrl, updated.face.cutoutUrl)
  assert.equal(updated.item.thumbUrl, updated.face.thumbUrl)
  assert.equal(updated.item.status, 'filed')
  console.log('PASS overlapping image updates keep intake and filed face in sync')

  const skipped = await seed()
  await intake.skipIntakeItems(ownerId, [skipped.id])
  await intake.updateIntakeItem(ownerId, skipped.id, { ...image, status: 'segmented' })
  assert.equal((await intake.getIntakeItem(ownerId, skipped.id)).status, 'skipped')
  console.log('PASS late processing does not resurrect a skipped item')

  await assert.rejects(intake.fileIntakeItem('other-owner', skipped.id, { title: 'Forbidden' }), /intake item not found/)
  await assert.rejects(intake.updateIntakeItem('other-owner', race.id, image), /intake item not found/)
  console.log('PASS filing and image updates reject another owner')

  await pool.query(`create function reject_face_update() returns trigger language plpgsql as $$ begin raise exception 'injected update failure'; end $$;
    create trigger reject_face_update before update on object_faces for each row execute function reject_face_update()`)
  await assert.rejects(intake.updateIntakeItem(ownerId, race.id, { ...image, cutoutUrl: 'https://media.invalid/must-rollback.webp' }))
  assert.equal((await rows(race.id)).item.cutoutUrl, updated.item.cutoutUrl)
  console.log('PASS a failed face update rolls back the intake image update')
  console.log('verify-intake-transactions: 9 checks passed')
} finally {
  await pool?.end()
  await admin.query(`drop database if exists ${database}`)
  await admin.end()
}
