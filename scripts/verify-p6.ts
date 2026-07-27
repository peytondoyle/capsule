/** Phase 6 proof: the last stage of the pipeline, plus retry-safety. */
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../src/server/db'
import { intakeBatches, intakeItems, objectFaces, objects } from '../src/server/db/schema'
import { addIntakeItem, createBatch, fileIntakeItem, listPendingIntake } from '../src/server/intake'
import { deleteObject } from '../src/server/objects'
import { deleteBlobs } from '../src/server/blob'
import { upsertPerson } from '../src/server/people'
import { deriveFromOriginal } from '../src/server/derive'
import { intakePath, originalsToken } from '../src/server/blob'
import { put } from '@vercel/blob'
import sharp from 'sharp'
import { requireVerificationBranch } from './verify-db'

// Must happen before the first getDb(); both clients read process.env lazily.
requireVerificationBranch()

/**
 * Makes its own intake item so the run is deterministic and repeatable —
 * driving it through the browser made the proof depend on click choreography
 * rather than on the pipeline.
 */
async function seedIntake(ownerId: string) {
  const bytes = await sharp({
    create: { width: 640, height: 260, channels: 3, background: '#ded7c8' },
  })
    .jpeg()
    .toBuffer()

  const batch = await createBatch(ownerId, 'files')
  const original = await put(intakePath(ownerId, `probe-${Date.now()}`, 'original.jpg'), bytes, {
    access: 'private',
    token: originalsToken(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'image/jpeg',
  })

  const item = await addIntakeItem(ownerId, batch.id, { originalUrl: original.url })
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
  return derived
}

let failures = 0
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failures++
}

async function main() {
  // `indexOf(...) + 1` lands on argv[0] — the node binary — when the flag is
  // absent, which reaches the DB as an owner id and fails on a foreign key
  // instead of saying what is wrong.
  const flag = process.argv.indexOf('--owner')
  const ownerId = flag === -1 ? 'user_seed_dev' : process.argv[flag + 1]
  if (!ownerId) throw new Error('--owner needs a value')
  const db = getDb()

  let pending = await listPendingIntake(ownerId)
  if (pending.length === 0) {
    const derived = await seedIntake(ownerId)
    check('derive produced a cutout', derived.width > 0, `${derived.width}×${derived.height}, ${derived.bytes}B`)
    pending = await listPendingIntake(ownerId)
  }
  check('an intake item is waiting', pending.length > 0, `${pending.length} pending`)
  const item = pending[0]!.item
  check('it has a private original', (item.originalUrl ?? '').includes('.private.'), item.originalUrl ?? '')
  check('it has a public cutout', (item.cutoutUrl ?? '').includes('.public.'), item.cutoutUrl ?? '')

  const dad = await upsertPerson(ownerId, 'Dad')
  const filed = await fileIntakeItem(ownerId, item.id, {
    title: 'P6 probe — boarding pass',
    kind: 'ticket_stub',
    receivedAt: '2019-11-12',
    story: 'Filed straight from the queue.',
    personIds: [dad.id],
  })
  check('it became an object', !filed.alreadyFiled && Boolean(filed.objectId), `lot ${filed.lotNo}`)

  const [object] = await db.select().from(objects).where(eq(objects.id, filed.objectId))
  check('kind drove the silhouette', object?.silhouette === 'ticket', object?.silhouette)
  check('date precision set from the date', object?.receivedPrecision === 'day')

  const faces = await db.select().from(objectFaces).where(eq(objectFaces.objectId, filed.objectId))
  check('a recto face carries both URLs',
    faces.length === 1 && (faces[0]!.originalUrl ?? '').includes('.private.') && (faces[0]!.cutoutUrl ?? '').includes('.public.'))

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
  // what the corner editor calls through /api/derive.
  const item2 = await seedIntake(ownerId)
  const pend2 = await listPendingIntake(ownerId)
  const target = pend2[0]!.item
  const tighter = await deriveFromOriginal(
    target.originalUrl!,
    { ownerId, key: intakePath(ownerId, target.id, '').replace(/\/$/, '') },
    [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ],
  )
  check(
    'corner correction re-derives smaller',
    tighter.width < item2.width && tighter.height < item2.height,
    `${item2.width}×${item2.height} → ${tighter.width}×${tighter.height}`,
  )

  // Everything above wrote to the same database the fixtures live in. Leaving
  // the probe behind put a second "Boarding pass" in the archive, which shadowed
  // the seed fixture in verify-p2 and pushed the lot counter past the fixture
  // range — a verification script is not allowed to change what it verifies.
  await deleteObject(ownerId, filed.objectId)
  const mine = await db
    .select({ id: intakeBatches.id })
    .from(intakeBatches)
    .where(eq(intakeBatches.ownerId, ownerId))
  if (mine.length) {
    const ids = mine.map((b) => b.id)
    const leftovers = await db
      .select({ originalUrl: intakeItems.originalUrl, cutoutUrl: intakeItems.cutoutUrl })
      .from(intakeItems)
      .where(inArray(intakeItems.batchId, ids))
    await deleteBlobs({
      originals: leftovers.map((i) => i.originalUrl),
      media: leftovers.map((i) => i.cutoutUrl),
    })
    // intake_items cascades from the batch.
    await db.delete(intakeBatches).where(inArray(intakeBatches.id, ids))
  }
  check('the run left nothing behind', (await listPendingIntake(ownerId)).length === 0)

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`)
  return failures
}

main().then((n) => process.exit(n ? 1 : 0), (e) => { console.error(e); process.exit(1) })
