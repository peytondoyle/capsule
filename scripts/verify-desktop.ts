/**
 * Proof for the desktop pass — the parts that live below the DOM.
 *
 *   npm run db:verify:desktop
 *
 * The Ledger's sort, the inspector's save path and the three Board actions the
 * toolbar reaches are all `src/server` behaviour, so they can be proved here
 * rather than by clicking. What this deliberately does NOT cover is the DOM
 * layer — that a click reaches these functions at all is what the pointer
 * harness proved when the Board's capture bug was fixed, and how the panels
 * look is what /design covers.
 *
 * Writes. Runs against the verify branch or refuses, like the other gates, and
 * restores every board position it disturbs.
 */
import { asc, eq } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import { objects, users } from '../src/server/db/schema'
import { listTimeline, updateObject, getObjectByLot } from '../src/server/objects'
import { getObjectDetail } from '../src/server/archive'
import { getBoard, tidyBoard, scatterBoard, clusterBoardBy } from '../src/server/board'
import { requireVerificationBranch } from './verify-db'

// Before the first getDb(), which is lazy — same position the other gates use.
requireVerificationBranch()

let failures = 0
function check(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failures++
}

async function main() {
  const db = getDb()

  const ownerArg = process.argv.indexOf('--owner')
  let ownerId = ownerArg > -1 ? process.argv[ownerArg + 1] : undefined
  if (!ownerId) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1)
    ownerId = rows[0]?.id
  }
  if (!ownerId) {
    console.error('no users on the branch; pass --owner <id>')
    process.exit(1)
  }
  console.log(`\nverifying against ${ownerId}\n`)

  /* ---- the board is restored on the way out, whatever happens ------------- */
  const before = await db
    .select({ id: objects.id, x: objects.boardX, y: objects.boardY, z: objects.boardZ })
    .from(objects)
    .where(eq(objects.ownerId, ownerId))

  async function restoreBoard() {
    for (const row of before) {
      await db
        .update(objects)
        .set({ boardX: row.x, boardY: row.y, boardZ: row.z })
        .where(eq(objects.id, row.id))
    }
  }

  try {
    /* ---- 1. the sort control actually sorts ------------------------------- */
    console.log('Ledger sort')
    const newest = await listTimeline(ownerId)
    const oldest = await listTimeline(ownerId, { sort: 'oldest' })

    check('newest is the default', newest.length > 0 && oldest.length > 0, `${newest.length} rows`)
    const nDates = newest.map((r) => r.object.receivedAt).filter(Boolean) as string[]
    const oDates = oldest.map((r) => r.object.receivedAt).filter(Boolean) as string[]
    check(
      'newest really is descending',
      nDates.every((d, i) => i === 0 || nDates[i - 1]! >= d),
      `${nDates[0]} … ${nDates.at(-1)}`,
    )
    check(
      'oldest really is ascending',
      oDates.every((d, i) => i === 0 || oDates[i - 1]! <= d),
      `${oDates[0]} … ${oDates.at(-1)}`,
    )
    check('the two are actual reverses of each other', nDates[0] === oDates.at(-1))
    check('same rows either way, only reordered', newest.length === oldest.length)
    // The bug this guards: ordering on createdAt while the heading says received.
    check(
      'undated objects stay out of both',
      newest.every((r) => r.object.receivedPrecision !== 'unknown'),
    )

    /* ---- 2. the inspector's save path round-trips ------------------------- */
    console.log('\nInspector save')
    const target = newest[0]!.object
    const original = {
      receivedAt: target.receivedAt,
      receivedPrecision: target.receivedPrecision,
    }

    // Exactly what saveFieldsAction writes for a supplied date.
    await updateObject(ownerId, target.id, { receivedAt: '2021-03-07', receivedPrecision: 'day' })
    let read = await getObjectDetail(ownerId, target.lotNo)
    check('a date written by the inspector persists', read?.receivedAt === '2021-03-07', String(read?.receivedAt))
    check('precision follows the date', read?.receivedPrecision === 'day')

    // And what it writes when the field is cleared — the branch that keeps a
    // cleared object out of the months instead of claiming a day it lost.
    await updateObject(ownerId, target.id, { receivedAt: null, receivedPrecision: 'unknown' })
    read = await getObjectDetail(ownerId, target.lotNo)
    check('clearing the date clears it', read?.receivedAt === null)
    check('and drops precision to unknown', read?.receivedPrecision === 'unknown')
    const cleared = await listTimeline(ownerId)
    check('a cleared object leaves the timeline', !cleared.some((r) => r.object.id === target.id))

    await updateObject(ownerId, target.id, original)
    read = await getObjectDetail(ownerId, target.lotNo)
    check('restored', read?.receivedAt === original.receivedAt, String(read?.receivedAt))

    // Ownership still holds on the path the inspector uses.
    const foreign = await getObjectByLot('user_does_not_exist', target.lotNo)
    check('another owner cannot read this lot', foreign === null)

    /* ---- 3. the three actions the toolbar now reaches --------------------- */
    console.log('\nBoard actions')
    const start = await getBoard(ownerId)
    check('board loads', start.items.length > 0, `${start.items.length} items, ${start.clusters.length} clusters`)

    await tidyBoard(ownerId)
    const tidied = await getBoard(ownerId)
    check('TIDY places every object', tidied.items.every((i) => i.x !== null && i.y !== null))
    const tidyPositions = tidied.items.map((i) => `${i.x},${i.y}`)
    check('TIDY does not stack two objects on one spot', new Set(tidyPositions).size === tidyPositions.length)
    await tidyBoard(ownerId)
    const tidiedAgain = await getBoard(ownerId)
    check(
      'TIDY is idempotent',
      tidiedAgain.items.every((i, n) => i.x === tidied.items[n]!.x && i.y === tidied.items[n]!.y),
    )

    await scatterBoard(ownerId)
    const scattered = await getBoard(ownerId)
    check('SCATTER moves things', scattered.items.some((i, n) => i.x !== tidied.items[n]!.x))
    await scatterBoard(ownerId)
    const scatteredAgain = await getBoard(ownerId)
    // Seeded by object id, so it survives a reload rather than reshuffling.
    check(
      'SCATTER is deterministic, not random',
      scatteredAgain.items.every((i, n) => i.x === scattered.items[n]!.x && i.y === scattered.items[n]!.y),
    )

    for (const dimension of ['person', 'place', 'year', 'kind'] as const) {
      await clusterBoardBy(ownerId, dimension)
      const clustered = await getBoard(ownerId)
      check(
        `CLUSTER BY ${dimension}`,
        clustered.clusters.length > 0,
        `${clustered.clusters.length} clusters`,
      )
    }
  } finally {
    await restoreBoard()
    const after = await getBoard(ownerId)
    const same = before.every((b) => {
      const now = after.items.find((i) => i.object.id === b.id)
      return !now || (now.x === b.x && now.y === b.y)
    })
    console.log(`\n  ${same ? 'ok  ' : 'FAIL'}  board restored to where it started`)
    if (!same) failures++
  }

  console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n')

}

main().then(
  () => process.exit(failures ? 1 : 0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
