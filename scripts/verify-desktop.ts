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
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import { collectionObjects, collections, objects, users } from '../src/server/db/schema'
import { listTimeline, updateObject } from '../src/server/objects'
import { getObjectDetail } from '../src/server/archive'
import { group } from '../src/lib/timeline'
import { getBoard, tidyBoard, scatterBoard, clusterBoardBy } from '../src/server/board'
import { check, failures, requireVerificationBranch, resolveOwner } from './verify-db'

// Before the first getDb(), which is lazy — same position the other gates use.
requireVerificationBranch()

async function main() {
  const db = getDb()

  const owner = resolveOwner(
    process.argv,
    await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)),
  )
  console.log(`\nverifying against ${owner}\n`)

  /* ---- everything this gate disturbs is restored on the way out -----------
   *
   * Positions AND collections. clusterBoardBy deletes every cluster row and
   * inserts fresh ones, so restoring only board_x/y/z leaves the archive with
   * generated clusters in place of its own — and a count check cannot see it,
   * because the counts can coincide. Read raw columns here, never getBoard():
   * getBoard substitutes a computed default for a null position, so comparing
   * against it makes the restore check fail for every unplaced object.
   */
  const before = await db
    .select({ id: objects.id, x: objects.boardX, y: objects.boardY, z: objects.boardZ })
    .from(objects)
    .where(eq(objects.ownerId, owner))

  const beforeClusters = await db
    .select()
    .from(collections)
    .where(and(eq(collections.ownerId, owner), eq(collections.kind, 'cluster')))
  const beforeClusterIds = new Set(beforeClusters.map((c) => c.id))
  // Scoped in the query, not filtered in JS: the unscoped version read every
  // membership row in the database — including other owners' — and then held
  // the whole array alive in restoreAll's closure for the run.
  const beforeMembership = beforeClusterIds.size
    ? await db
        .select()
        .from(collectionObjects)
        .where(inArray(collectionObjects.collectionId, [...beforeClusterIds]))
    : []

  async function restoreAll() {
    // Concurrent, not sequential: over neon-http each statement is its own HTTPS
    // round-trip, so a loop of awaits costs one latency per object — and this
    // runs in a finally, so it is paid on failure too. Each UPDATE is an
    // independent autocommit, so there is nothing to serialise.
    await Promise.all(
      before.map((row) =>
        db
          .update(objects)
          .set({ boardX: row.x, boardY: row.y, boardZ: row.z })
          .where(eq(objects.id, row.id)),
      ),
    )
    await db
      .delete(collections)
      .where(and(eq(collections.ownerId, owner), eq(collections.kind, 'cluster')))
    if (beforeClusters.length) {
      await db.insert(collections).values(beforeClusters)
      if (beforeMembership.length) await db.insert(collectionObjects).values(beforeMembership)
    }
  }

  /** Raw positions, straight from the column — no coalescing. */
  const rawPositions = async () =>
    db
      .select({ id: objects.id, x: objects.boardX, y: objects.boardY, z: objects.boardZ })
      .from(objects)
      .where(eq(objects.ownerId, owner))
  const clusterRows = async () =>
    db
      .select({ id: collections.id, rule: collections.rule })
      .from(collections)
      .where(and(eq(collections.ownerId, owner), eq(collections.kind, 'cluster')))
  const clusterIds = async () => (await clusterRows()).map((c) => c.id)

  try {
    /* ---- 1. the sort control actually sorts ------------------------------- */
    console.log('Ledger sort')
    const newest = await listTimeline(owner)
    const oldest = await listTimeline(owner, { sort: 'oldest' })

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

    // The query order is not what the page renders — Stream regroups it. This
    // is the assertion whose absence let a sort control ship that did not sort.
    const gNew = group(newest)
    const gOld = group(oldest)
    const shownNewest = gNew.map((y) => y.year)
    const shownOldest = gOld.map((y) => y.year)
    check(
      'the rendered stream leads with the newest year',
      shownNewest[0] === Math.max(...shownNewest),
      String(shownNewest[0]),
    )
    check(
      'the rendered stream leads with the oldest year when sorted oldest',
      shownOldest[0] === Math.min(...shownOldest),
      String(shownOldest[0]),
    )
    check(
      'the rendered year order actually reverses',
      JSON.stringify(shownOldest) === JSON.stringify([...shownNewest].reverse()),
      `${shownNewest.join(' ')}  vs  ${shownOldest.join(' ')}`,
    )
    // Pick a year that actually has more than one month — comparing a
    // single-element array against its own reverse passes for any implementation.
    const multi = gNew.find((y) => y.months.filter((m) => m.month !== 0).length > 1)
    if (!multi) {
      check('months reverse too, within a year', false, 'no year has two months — assertion would be vacuous')
    } else {
      const mNew = multi.months.map((m) => m.month).filter((m) => m !== 0)
      const mOld = gOld
        .find((y) => y.year === multi.year)!
        .months.map((m) => m.month)
        .filter((m) => m !== 0)
      check(
        `months reverse too, within ${multi.year}`,
        JSON.stringify(mOld) === JSON.stringify([...mNew].reverse()),
        `${mNew.join(',')} vs ${mOld.join(',')}`,
      )
    }
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
    const originalLocation = target.retainedLocation

    // Exactly what saveFieldsAction writes for a supplied date.
    await updateObject(owner, target.id, { receivedAt: '2021-03-07', receivedPrecision: 'day' })
    let read = await getObjectDetail(owner, target.lotNo)
    check('a date written by the inspector persists', read?.receivedAt === '2021-03-07', String(read?.receivedAt))
    check('precision follows the date', read?.receivedPrecision === 'day')

    // And what it writes when the field is cleared — the branch that keeps a
    // cleared object out of the months instead of claiming a day it lost.
    await updateObject(owner, target.id, { receivedAt: null, receivedPrecision: 'unknown' })
    read = await getObjectDetail(owner, target.lotNo)
    check('clearing the date clears it', read?.receivedAt === null)
    check('and drops precision to unknown', read?.receivedPrecision === 'unknown')
    const cleared = await listTimeline(owner)
    check('a cleared object leaves the timeline', !cleared.some((r) => r.object.id === target.id))

    await updateObject(owner, target.id, original)
    read = await getObjectDetail(owner, target.lotNo)
    check('restored', read?.receivedAt === original.receivedAt, String(read?.receivedAt))

    // Ownership still holds on the path the inspector uses.
    // The bug this guards: saveFieldsAction wrote retainedLocation
    // unconditionally, so the Ledger inspector — whose form has no such field —
    // erased "in the blue tin, top shelf" on every save. The action needs a
    // session and cannot be called here, but the mechanism the fix relies on can:
    // a patch that omits the key must leave the column alone.
    await updateObject(owner, target.id, { retainedLocation: 'in the blue tin, top shelf' })
    await updateObject(owner, target.id, { title: target.title })
    const kept = await getObjectDetail(owner, target.lotNo)
    check(
      'a patch that omits retainedLocation does not erase it',
      kept?.retainedLocation === 'in the blue tin, top shelf',
      String(kept?.retainedLocation),
    )
    await updateObject(owner, target.id, { retainedLocation: originalLocation })

    // getObjectDetail, not getObjectByLot — the inspector reads through the
    // former, and asserting on a function the surface never calls proves nothing
    // about the surface.
    const foreign = await getObjectDetail('user_does_not_exist', target.lotNo)
    check('another owner cannot read this lot', foreign === null)

    /* ---- 3. the three actions the toolbar now reaches --------------------- *
     * Asserted against raw board_x/board_y, never getBoard(): getBoard fills a
     * null position with a computed default, so `x !== null` is unfalsifiable
     * through it and every one of these checks would pass on a dead function.
     */
    console.log('\nBoard actions')
    const startItems = await getBoard(owner)
    check('board loads', startItems.items.length > 0, `${startItems.items.length} items`)

    await tidyBoard(owner)
    const tidied = await rawPositions()
    check(
      'TIDY writes a real position for every object',
      tidied.length > 0 && tidied.every((r) => r.x !== null && r.y !== null),
      `${tidied.filter((r) => r.x !== null).length}/${tidied.length} placed`,
    )
    const spots = tidied.map((r) => `${r.x},${r.y}`)
    check('TIDY does not stack two objects on one spot', new Set(spots).size === spots.length)
    await tidyBoard(owner)
    const tidiedAgain = await rawPositions()
    const byId = new Map(tidied.map((r) => [r.id, r]))
    check(
      'TIDY is idempotent',
      tidiedAgain.every((r) => byId.get(r.id)?.x === r.x && byId.get(r.id)?.y === r.y),
    )

    await scatterBoard(owner)
    const scattered = await rawPositions()
    check('SCATTER moves things', scattered.some((r) => byId.get(r.id)?.x !== r.x))
    await scatterBoard(owner)
    const scatteredAgain = await rawPositions()
    const scatterById = new Map(scattered.map((r) => [r.id, r]))
    // Seeded by object id, so a scattered board survives a reload rather than
    // reshuffling on every navigation.
    check(
      'SCATTER is deterministic, not random',
      scatteredAgain.every((r) => scatterById.get(r.id)?.x === r.x),
    )

    // Only generated clusters (rule is not null) are clusterBoardBy's to
    // replace; one the owner made by hand has no rule and must survive. That
    // distinction is the whole contract, so assert both halves of it.
    let state = await clusterRows()
    const handMade = state.filter((c) => c.rule === null).map((c) => c.id)
    for (const dimension of ['person', 'place', 'year', 'kind'] as const) {
      // Carried forward from the previous iteration rather than re-read.
      const genBefore = state.filter((c) => c.rule !== null).map((c) => c.id)
      await clusterBoardBy(owner, dimension)
      const after = await clusterRows()
      state = after
      const genAfter = after.filter((c) => c.rule !== null).map((c) => c.id)
      check(
        `CLUSTER BY ${dimension} replaces every generated cluster`,
        genAfter.length > 0 && !genAfter.some((id) => genBefore.includes(id)),
        `${genBefore.length} → ${genAfter.length} generated`,
      )
      check(
        `CLUSTER BY ${dimension} leaves hand-made clusters alone`,
        handMade.every((id) => after.some((c) => c.id === id)),
        `${handMade.length} hand-made`,
      )
      check(
        `CLUSTER BY ${dimension} tags every generated cluster with the dimension`,
        genAfter.length > 0 &&
          after
            .filter((c) => c.rule !== null)
            .every((c) => (c.rule as { clusterBy?: string }).clusterBy === dimension),
      )
    }

    // The grouping is real, not one bucket: clustering by year must produce
    // exactly one generated cluster per distinct label, counting the 'Undated'
    // bucket that objects with no date collapse into.
    await clusterBoardBy(owner, 'year')
    const [labels] = await db
      .select({
        n: sql<number>`count(distinct coalesce(to_char(${objects.receivedAt}, 'YYYY'), 'Undated'))::int`,
      })
      .from(objects)
      .where(eq(objects.ownerId, owner))
    const generated = (await clusterRows()).filter((c) => c.rule !== null)
    check(
      'CLUSTER BY year makes one cluster per distinct year, plus Undated',
      generated.length === labels!.n,
      `${generated.length} generated vs ${labels!.n} labels`,
    )
  } finally {
    await restoreAll()
    const after = await rawPositions()
    const nowById = new Map(after.map((r) => [r.id, r]))
    const positionsBack = before.every((b) => {
      const now = nowById.get(b.id)
      return now && now.x === b.x && now.y === b.y && now.z === b.z
    })
    const idsBack = new Set(await clusterIds())
    const clustersBack =
      idsBack.size === beforeClusterIds.size && [...beforeClusterIds].every((id) => idsBack.has(id))
    console.log('')
    check('every board position restored (incl. z and nulls)', positionsBack)
    check("the archive's own clusters restored, not just the count", clustersBack)
  }

  console.log(failures() ? `\n${failures()} FAILED\n` : '\nall checks passed\n')

}

main().then(
  () => process.exit(failures() ? 1 : 0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
