/** Phase 6 proof: the last stage of the pipeline, plus retry-safety. */
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../src/server/db'
import { intakeBatches, intakeItems, objectFaces, objects } from '../src/server/db/schema'
import { addIntakeItem, createBatch, fileIntakeItem, listPendingIntake } from '../src/server/intake'
import { deleteObject } from '../src/server/objects'
import { deleteBlobs, intakePath, originalsToken } from '../src/server/blob'
import { upsertPerson } from '../src/server/people'
import { deriveFromOriginal } from '../src/server/derive'
import { put } from '@vercel/blob'
import sharp from 'sharp'
import { requireVerificationBranch } from './verify-db'

// Must happen before the first getDb(); both clients read process.env lazily.
requireVerificationBranch()

/**
 * Everything this run created, so cleanup can delete exactly that and nothing
 * else.
 *
 * The Neon `verify` branch isolates rows, but **the Blob stores are not
 * branched** — a del() here hits the same bytes production serves. So the sweep
 * may never be "everything belonging to this owner": a filed object's
 * object_faces URLs are the *same strings* the intake row holds (see
 * fileIntakeItem), so deleting an owner's intake blobs wholesale destroys the
 * images of objects they already filed. Track ids; delete those.
 */
const created = { batchIds: [] as string[], itemIds: [] as string[], objectIds: [] as string[] }

/**
 * Makes its own intake item so the run is deterministic and repeatable —
 * driving it through the browser made the proof depend on click choreography
 * rather than on the pipeline.
 *
 * Never adopts an item that is already waiting: those are a real person's
 * photographs sitting in /queue, and this script files and then deletes what it
 * is given.
 */
async function seedIntake(ownerId: string) {
  const bytes = await sharp({
    create: { width: 640, height: 260, channels: 3, background: '#ded7c8' },
  })
    .jpeg()
    .toBuffer()

  const batch = await createBatch(ownerId, 'files')
  created.batchIds.push(batch.id)

  const original = await put(intakePath(ownerId, `probe-${Date.now()}`, 'original.jpg'), bytes, {
    access: 'private',
    token: originalsToken(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'image/jpeg',
  })

  const item = await addIntakeItem(ownerId, batch.id, { originalUrl: original.url })
  created.itemIds.push(item.id)

  const derived = await deriveFromOriginal(
    original.url,
    { ownerId, key: intakePath(ownerId, item.id, '').replace(/\/$/, '') },
    [
      { x: 0.05, y: 0.1 },
      { x: 0.95, y: 0.1 },
      { x: 0.95, y: 0.9 },
      { x: 0.05, y: 0.9 },
    ],
  )
  await getDb()
    .update(intakeItems)
    .set({ cutoutUrl: derived.cutoutUrl, status: 'segmented' })
    .where(eq(intakeItems.id, item.id))

  return { derived, itemId: item.id, batchId: batch.id }
}

/** Deletes exactly what this run made, whether or not the run succeeded. */
async function cleanup(ownerId: string) {
  for (const objectId of created.objectIds) {
    try {
      await deleteObject(ownerId, objectId)
    } catch {
      // already gone
    }
  }
  if (created.itemIds.length) {
    const rows = await getDb()
      .select({ originalUrl: intakeItems.originalUrl, cutoutUrl: intakeItems.cutoutUrl })
      .from(intakeItems)
      .where(inArray(intakeItems.id, created.itemIds))
    await deleteBlobs({
      originals: rows.map((r) => r.originalUrl),
      media: rows.map((r) => r.cutoutUrl),
    })
  }
  if (created.batchIds.length) {
    // intake_items cascades from the batch.
    await getDb().delete(intakeBatches).where(inArray(intakeBatches.id, created.batchIds))
  }
}

let failures = 0
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failures++
}

/**
 * `indexOf(...) + 1` lands on argv[0] — the node binary — when the flag is
 * absent, which reaches the DB as an owner id and fails on a foreign key
 * instead of saying what is wrong.
 */
function owner() {
  const flag = process.argv.indexOf('--owner')
  if (flag === -1) return 'user_seed_dev'
  const value = process.argv[flag + 1]
  if (!value) throw new Error('--owner needs a value')
  return value
}

async function main() {
  const ownerId = owner()
  const db = getDb()

  const before = await listPendingIntake(ownerId)

  const seeded = await seedIntake(ownerId)
  check(
    'derive produced a cutout',
    seeded.derived.width > 0,
    `${seeded.derived.width}×${seeded.derived.height}, ${seeded.derived.bytes}B`,
  )

  const pending = await listPendingIntake(ownerId)
  const mine = pending.find((row) => row.item.id === seeded.itemId)
  check('the probe is waiting', Boolean(mine), `${pending.length} pending`)
  const item = mine!.item
  check(
    'it has a private original',
    (item.originalUrl ?? '').includes('.private.'),
    item.originalUrl ?? '',
  )
  check('it has a public cutout', (item.cutoutUrl ?? '').includes('.public.'), item.cutoutUrl ?? '')

  const dad = await upsertPerson(ownerId, 'Dad')
  const filed = await fileIntakeItem(ownerId, item.id, {
    title: 'P6 probe — boarding pass',
    kind: 'ticket_stub',
    receivedAt: '2019-11-12',
    story: 'Filed straight from the queue.',
    personIds: [dad.id],
  })
  created.objectIds.push(filed.objectId)
  check('it became an object', !filed.alreadyFiled && Boolean(filed.objectId), `lot ${filed.lotNo}`)

  const [object] = await db.select().from(objects).where(eq(objects.id, filed.objectId))
  check('kind drove the silhouette', object?.silhouette === 'ticket', object?.silhouette)
  check('date precision set from the date', object?.receivedPrecision === 'day')

  const faces = await db.select().from(objectFaces).where(eq(objectFaces.objectId, filed.objectId))
  check(
    'a recto face carries both URLs',
    faces.length === 1 &&
      (faces[0]!.originalUrl ?? '').includes('.private.') &&
      (faces[0]!.cutoutUrl ?? '').includes('.public.'),
  )

  const [after] = await db.select().from(intakeItems).where(eq(intakeItems.id, item.id))
  check('the intake item is marked filed', after?.status === 'filed' && after?.objectId === filed.objectId)

  // The offline queue will retry these, so a second call must not duplicate.
  const again = await fileIntakeItem(ownerId, item.id, { title: 'should not duplicate' })
  const countAfter = await db.select().from(objects).where(eq(objects.ownerId, ownerId))
  check('re-filing is idempotent', again.alreadyFiled === true, `${countAfter.length} object(s) total`)

  const foreign = await listPendingIntake('user_does_not_exist')
  check('intake is owner-scoped', foreign.length === 0)
  let rejected = false
  try { await fileIntakeItem('user_does_not_exist', item.id, { title: 'x' }) } catch { rejected = true }
  check('filing another owner’s item is rejected', rejected)

  const batches = await db.select().from(intakeBatches).where(eq(intakeBatches.ownerId, ownerId))
  check('the batch is recorded', batches.length > 0, `${batches.length} batch(es)`)

  // Corner correction: a tighter box must yield a smaller derivative — this is
  // what the corner editor calls through /api/derive. Derive against the probe
  // this run seeded, by id: listPendingIntake orders oldest first, so taking
  // its head would compare a tight crop of somebody's 4032×3024 phone photo
  // against a 640×260 probe and report a failure that is not one.
  const second = await seedIntake(ownerId)
  const [target] = await db.select().from(intakeItems).where(eq(intakeItems.id, second.itemId))
  const tighter = await deriveFromOriginal(
    target!.originalUrl!,
    { ownerId, key: intakePath(ownerId, target!.id, '').replace(/\/$/, '') },
    [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ],
  )
  check(
    'corner correction re-derives smaller',
    tighter.width < second.derived.width && tighter.height < second.derived.height,
    `${second.derived.width}×${second.derived.height} → ${tighter.width}×${tighter.height}`,
  )

  await cleanup(ownerId)
  const restored = await listPendingIntake(ownerId)
  check(
    'the run left nothing behind',
    restored.length === before.length,
    `${before.length} pending before, ${restored.length} after`,
  )

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`)
  return failures
}

main().then(
  (n) => process.exit(n ? 1 : 0),
  async (e) => {
    // A throw partway through still leaves a probe object and its blobs.
    console.error(e)
    await cleanup(owner()).catch(() => {})
    process.exit(1)
  },
)
