/**
 * Phase 2 proof gates. Exercises the real query functions in src/server, not
 * raw SQL, so a passing run means the module boundary works too.
 *
 *   npm run db:verify -- --owner user_seed_dev
 */
import { and, eq, sql } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import { objects } from '../src/server/db/schema'
import { clusterBoardBy, dropOnCluster, getBoard, tidyBoard } from '../src/server/board'
import {
  assertOwned,
  attachTag,
  countUnfiled,
  createObject,
  deleteObject,
  detachTag,
  getObjectByLot,
  listTimeline,
  searchObjects,
} from '../src/server/objects'
import { getPersonStats, listPeopleWithCounts } from '../src/server/people'
import { listPlacesWithCounts, listTagsWithCounts } from '../src/server/taxonomy'

let failures = 0
function check(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failures++
}

async function main() {
  const argIndex = process.argv.indexOf('--owner')
  const ownerId = argIndex > -1 ? process.argv[argIndex + 1]! : 'user_seed_dev'
  const db = getDb()

  console.log(`\nverifying ${ownerId}\n`)

  // --- lot numbers -------------------------------------------------------
  const lots = await db
    .select({ lotNo: objects.lotNo })
    .from(objects)
    .where(eq(objects.ownerId, ownerId))
    .orderBy(objects.lotNo)
  const values = lots.map((l) => l.lotNo)
  const gapless = values.every((v, i) => v === i + 1)
  check('lot numbers gapless from 1', gapless, `${values.length} objects, max ${values.at(-1)}`)

  // --- concurrency: 12 simultaneous inserts must not collide or skip -----
  // Anchored on the counter, not the object count: deleting an object retires
  // its lot number for good, so the two legitimately drift apart.
  const nextBefore = (
    await db.execute<{ next_lot: number }>(
      sql`select next_lot from owner_counters where owner_id = ${ownerId}`,
    )
  ).rows[0]!.next_lot

  const burst = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      createObject(ownerId, { title: `concurrency probe ${i}`, kind: 'other' }),
    ),
  )
  const burstLots = burst.map((o) => o.lotNo).sort((a, b) => a - b)
  const expected = Array.from({ length: 12 }, (_, i) => nextBefore + i)
  check(
    'concurrent allocation is gapless and unique',
    JSON.stringify(burstLots) === JSON.stringify(expected),
    `got ${burstLots[0]}…${burstLots.at(-1)}, expected ${expected[0]}…${expected.at(-1)}`,
  )

  // A failed insert must not burn a lot number.
  const beforeFail = (
    await db.select({ n: sql<number>`max(${objects.lotNo})::int` }).from(objects).where(eq(objects.ownerId, ownerId))
  )[0]!.n
  let rolledBack = false
  try {
    // title is NOT NULL — force the insert to fail after the counter bumps.
    await createObject(ownerId, { title: null as unknown as string })
  } catch {
    rolledBack = true
  }
  const afterFail = (
    await db.select({ n: sql<number>`max(${objects.lotNo})::int` }).from(objects).where(eq(objects.ownerId, ownerId))
  )[0]!.n
  const counter = (
    await db.execute<{ next_lot: number }>(
      sql`select next_lot from owner_counters where owner_id = ${ownerId}`,
    )
  ).rows[0]!.next_lot
  check(
    'failed insert rolls the counter back',
    rolledBack && afterFail === beforeFail && counter === beforeFail + 1,
    `max lot ${afterFail}, next_lot ${counter}`,
  )

  for (const o of burst) await deleteObject(ownerId, o.id)

  // --- reads -------------------------------------------------------------
  const unfiled = await countUnfiled(ownerId)
  check('unfiled count is 7', unfiled === 7, String(unfiled))

  const timeline = await listTimeline(ownerId)
  const datedTotal = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(objects)
      .where(and(eq(objects.ownerId, ownerId), sql`${objects.receivedPrecision} <> 'unknown'`))
  )[0]!.n
  check('timeline excludes unknown dates', timeline.length === datedTotal, `${timeline.length} rows`)
  check(
    'timeline joins the recto face',
    timeline.every((row) => row.recto !== null),
    `${timeline.filter((r) => r.recto !== null).length}/${timeline.length} with a face`,
  )
  const dates = timeline.map((r) => r.object.receivedAt).filter(Boolean) as string[]
  check(
    'timeline is newest first',
    dates.every((d, i) => i === 0 || dates[i - 1]! >= d),
  )

  const boardingPass = timeline.find((r) => r.object.title.startsWith('Boarding pass'))
  check('fixture object present', Boolean(boardingPass), boardingPass?.object.title)
  check(
    'ticket silhouette survived the round trip',
    boardingPass?.object.silhouette === 'ticket' && boardingPass?.object.cutStyle === 'die_cut',
  )
  check(
    'rotation is a persisted non-zero jitter',
    typeof boardingPass?.object.rotationDeg === 'number' && boardingPass.object.rotationDeg !== 0,
    String(boardingPass?.object.rotationDeg),
  )

  const byLot = await getObjectByLot(ownerId, 1)
  check('getObjectByLot returns faces', (byLot?.faces.length ?? 0) === 1, byLot?.title)

  const found = await searchObjects(ownerId, 'lisbon')
  check('text search hits title or story', found.length > 0, `${found.length} rows`)
  const byNumber = await searchObjects(ownerId, 'OBJ-0001')
  check('search resolves a lot number', byNumber.some((o) => o.object.lotNo === 1))
  const byPerson = await searchObjects(ownerId, 'grandma')
  check('search reaches the giver', byPerson.length > 0, `${byPerson.length} rows`)
  const byPlace = await searchObjects(ownerId, 'fillmore')
  check('search reaches the place', byPlace.length > 0, `${byPlace.length} rows`)

  const peopleRows = await listPeopleWithCounts(ownerId)
  check('people carry counts', peopleRows.length > 0 && peopleRows[0]!.objectCount > 0,
    peopleRows.map((p) => `${p.name}:${p.objectCount}`).join(' '))

  const dad = peopleRows.find((p) => p.name === 'Dad')
  const stats = dad ? await getPersonStats(ownerId, dad.id) : null
  check(
    'person stats give a year range',
    Boolean(stats && stats.firstYear && stats.lastYear && stats.firstYear <= stats.lastYear),
    stats ? `${stats.objectCount} objects, ${stats.firstYear}–${stats.lastYear}` : '',
  )

  const placeRows = await listPlacesWithCounts(ownerId)
  check('places carry counts', placeRows.some((p) => p.objectCount > 0), `${placeRows.length} places`)

  const tagRows = await listTagsWithCounts(ownerId)
  check('tags carry counts', tagRows.some((t) => t.objectCount > 0), `${tagRows.length} tags`)

  // --- tenant isolation ---------------------------------------------------
  // With RLS gone this is the whole boundary, so it gets permanent assertions
  // rather than a one-off manual check.
  const otherTimeline = await listTimeline('user_does_not_exist')
  check('another owner sees nothing', otherTimeline.length === 0)
  const otherLot = await getObjectByLot('user_does_not_exist', 1)
  check('getObjectByLot is owner-scoped', otherLot === null)

  const victim = await getObjectByLot(ownerId, 1)
  if (victim) {
    let rejected = false
    try {
      await assertOwned('user_does_not_exist', victim.id)
    } catch {
      rejected = true
    }
    check('assertOwned rejects a foreign object id', rejected)

    let writeRejected = false
    try {
      await attachTag('user_does_not_exist', victim.id, 'intruder')
    } catch {
      writeRejected = true
    }
    const leaked = (await getObjectByLot(ownerId, 1))!
    check(
      'a mutation with the wrong owner cannot write',
      writeRejected,
      `object still lot ${leaked.lotNo}`,
    )

    // and the legitimate path still works
    const tag = await attachTag(ownerId, victim.id, 'verify-probe')
    const withTag = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from object_tags where object_id = ${victim.id}`,
    )
    check('attachTag works for the real owner', (withTag.rows[0]?.n ?? 0) > 0)
    if (tag) await detachTag(ownerId, victim.id, tag.id)
  }

  // --- board ---------------------------------------------------------------
  const board = await getBoard(ownerId)
  check('board returns every object with a position',
    board.items.length > 0 && board.items.every((i) => Number.isFinite(i.x) && Number.isFinite(i.y)),
    `${board.items.length} items, ${board.clusters.length} clusters`)

  const probe = board.items[0]!
  const { moveObject } = await import('../src/server/objects')
  await moveObject(ownerId, probe.object.id, { x: 424, y: 242, z: 7 })
  const after = await getBoard(ownerId)
  const moved = after.items.find((i) => i.object.id === probe.object.id)!
  check('drag position persists', moved.x === 424 && moved.y === 242 && moved.z === 7)

  const cluster = after.clusters.find((c) => (c.collection.impliedTags as string[]).length > 0)
  if (cluster) {
    const dropped = await dropOnCluster(ownerId, probe.object.id, cluster.collection.id)
    const tagged = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from object_tags ot
      join tags t on t.id = ot.tag_id
      where ot.object_id = ${probe.object.id}
        and t.name = ${(cluster.collection.impliedTags as string[])[0]!}
    `)
    check('drop-to-cluster applies the implied tags',
      dropped.applied.length > 0 && (tagged.rows[0]?.n ?? 0) > 0,
      `applied ${dropped.applied.join(', ')}`)
  }

  // Regression guard: a correlated subquery that referenced an unqualified
  // column silently collapsed every object into one group, because drizzle only
  // qualifies interpolated columns when the query has a join. Asserting a
  // *plural* group count is what catches that class of silent-wrong-answer.
  for (const [dimension, least] of [
    ['person', 2],
    ['place', 2],
    ['year', 2],
    ['kind', 2],
  ] as const) {
    const result = await clusterBoardBy(ownerId, dimension)
    check(
      `cluster by ${dimension} produces real groups`,
      result.clusters >= least && result.objects === values.length,
      `${result.clusters} groups over ${result.objects} objects`,
    )
  }

  const clustered = await getBoard(ownerId)
  const generated = clustered.clusters.filter((c) => c.collection.rule !== null)
  const inside = clustered.items.filter((item) =>
    generated.some((g) => {
      const c = g.collection
      return (
        item.x >= (c.boardX ?? 0) &&
        item.x <= (c.boardX ?? 0) + (c.boardW ?? 0) &&
        item.y >= (c.boardY ?? 0) &&
        item.y <= (c.boardY ?? 0) + (c.boardH ?? 0)
      )
    }),
  ).length
  check('clustering packs every object inside a rect', inside === clustered.items.length,
    `${inside}/${clustered.items.length}`)

  await tidyBoard(ownerId)
  const tidy1 = await getBoard(ownerId)
  await tidyBoard(ownerId)
  const tidy2 = await getBoard(ownerId)
  check('tidy is idempotent',
    JSON.stringify(tidy1.items.map((i) => [i.x, i.y])) === JSON.stringify(tidy2.items.map((i) => [i.x, i.y])))

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`)
  return failures
}

main().then(
  (n) => process.exit(n === 0 ? 0 : 1),
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
