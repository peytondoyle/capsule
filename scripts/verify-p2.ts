/**
 * Phase 2 proof gates. Exercises the real query functions in src/server, not
 * raw SQL, so a passing run means the module boundary works too.
 *
 *   npm run db:verify -- --owner user_seed_dev
 */
import { and, eq, sql } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import { objects } from '../src/server/db/schema'
import {
  countUnfiled,
  createObject,
  deleteObject,
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
  check('search resolves a lot number', byNumber.some((o) => o.lotNo === 1))
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
  const otherTimeline = await listTimeline('user_does_not_exist')
  check('another owner sees nothing', otherTimeline.length === 0)
  const otherLot = await getObjectByLot('user_does_not_exist', 1)
  check('getObjectByLot is owner-scoped', otherLot === null)

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
