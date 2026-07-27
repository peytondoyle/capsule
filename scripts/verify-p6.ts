/** Phase 6 proof: the last stage of the pipeline, plus retry-safety. */
import { eq } from 'drizzle-orm'
import { getDb } from '../src/server/db'
import { intakeBatches, intakeItems, objectFaces, objects } from '../src/server/db/schema'
import { addIntakeItem, createBatch, fileIntakeItem, listPendingIntake } from '../src/server/intake'
import { upsertPerson } from '../src/server/people'
import { deriveFromOriginal } from '../src/server/derive'
import { intakePath, originalsToken } from '../src/server/blob'
import { put } from '@vercel/blob'
import sharp from 'sharp'

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
  const ownerId = process.argv[process.argv.indexOf('--owner') + 1]!
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
    title: 'Boarding pass, LIS → JFK',
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

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`)
  return failures
}

main().then((n) => process.exit(n ? 1 : 0), (e) => { console.error(e); process.exit(1) })
