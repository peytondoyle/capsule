import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import {
  collectionObjects,
  collections,
  objectFaces,
  objectPeople,
  objects,
  people,
  places,
} from './db/schema'
import { assertOwned } from './objects'
import { attachTag } from './objects'

/**
 * Everything the Board renders in one query: every object with its recto face
 * and persisted position, plus the cluster rectangles.
 *
 * Objects that have never been placed get a deterministic default derived from
 * their lot number — computed here, not written, so the archive is never
 * mutated just by being looked at. A position becomes real the first time the
 * owner drags it.
 */
export async function getBoard(ownerId: string) {
  const db = getDb()

  const [rows, clusters] = await Promise.all([
    db
      .select({
        object: objects,
        recto: {
          id: objectFaces.id,
          cutoutUrl: objectFaces.cutoutUrl,
          width: objectFaces.width,
          height: objectFaces.height,
        },
        giver: sql<string | null>`(
          select p.name from ${objectPeople} op
          join people p on p.id = op.person_id
          where op.object_id = ${objects.id} and op.role = 'given_by'
          limit 1
        )`,
      })
      .from(objects)
      .leftJoin(
        objectFaces,
        and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')),
      )
      .where(eq(objects.ownerId, ownerId))
      .orderBy(asc(objects.boardZ), asc(objects.lotNo)),
    db
      .select({
        collection: collections,
        count: sql<number>`(
          select count(*)::int from ${collectionObjects} co
          where co.collection_id = ${collections.id}
        )`,
      })
      .from(collections)
      .where(and(eq(collections.ownerId, ownerId), eq(collections.kind, 'cluster')))
      .orderBy(asc(collections.sortOrder)),
  ])

  return {
    items: rows.map((row, index) => ({
      ...row,
      x: row.object.boardX ?? defaultPosition(row.object.lotNo, index).x,
      y: row.object.boardY ?? defaultPosition(row.object.lotNo, index).y,
      z: row.object.boardZ,
      placed: row.object.boardX !== null,
    })),
    clusters,
  }
}

/** A loose spiral seeded by lot number — stable across loads, roomy enough to drag. */
function defaultPosition(lotNo: number, index: number) {
  const angle = index * 2.39996 // golden angle, keeps neighbours apart
  const radius = 160 + 46 * Math.sqrt(index)
  return {
    x: Math.round(760 + radius * Math.cos(angle) + (lotNo % 7) * 6),
    y: Math.round(430 + radius * 0.72 * Math.sin(angle) + (lotNo % 5) * 6),
  }
}

/**
 * Dropping into a cluster applies that cluster's implied tags — tagging *is*
 * the drag gesture, which is the entire point of this direction.
 */
export async function dropOnCluster(ownerId: string, objectId: string, clusterId: string) {
  await assertOwned(ownerId, objectId)
  const db = getDb()

  const [cluster] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, clusterId), eq(collections.ownerId, ownerId)))
    .limit(1)
  if (!cluster) throw new Error('cluster not found')

  await db
    .insert(collectionObjects)
    .values({ collectionId: clusterId, objectId })
    .onConflictDoNothing()

  const implied = Array.isArray(cluster.impliedTags) ? (cluster.impliedTags as string[]) : []
  for (const name of implied) await attachTag(ownerId, objectId, name)

  return { applied: implied }
}

/**
 * TIDY: pack everything into rows, respecting nothing — the design's tidy is a
 * fresh start, not a constraint solver. Deterministic, so it is idempotent.
 */
export async function tidyBoard(ownerId: string) {
  const db = getDb()
  const rows = await db
    .select({ id: objects.id, lotNo: objects.lotNo })
    .from(objects)
    .where(eq(objects.ownerId, ownerId))
    .orderBy(asc(objects.lotNo))

  const perRow = 8
  for (const [index, row] of rows.entries()) {
    await db
      .update(objects)
      .set({
        boardX: 140 + (index % perRow) * 170,
        boardY: 120 + Math.floor(index / perRow) * 190,
        boardZ: 0,
      })
      .where(and(eq(objects.id, row.id), eq(objects.ownerId, ownerId)))
  }
  return rows.length
}

/** SCATTER: jitter seeded by lot number — deterministic, survives reload. */
export async function scatterBoard(ownerId: string) {
  const db = getDb()
  const rows = await db
    .select({ id: objects.id, lotNo: objects.lotNo })
    .from(objects)
    .where(eq(objects.ownerId, ownerId))
    .orderBy(asc(objects.lotNo))

  for (const [index, row] of rows.entries()) {
    const seed = (row.lotNo * 2654435761) >>> 0
    await db
      .update(objects)
      .set({
        boardX: 120 + ((seed % 1200) + index * 13) % 1240,
        boardY: 100 + ((seed >> 8) % 620),
        boardZ: 0,
      })
      .where(and(eq(objects.id, row.id), eq(objects.ownerId, ownerId)))
  }
  return rows.length
}

/**
 * CLUSTER BY: rebuild the cluster rects from a dimension, then pack each
 * group's objects inside its own rect.
 *
 * Regenerating rather than merging is deliberate — clustering by person and
 * then by year should give you the year layout, not the union of both. The
 * previous generated clusters are replaced; hand-made ones survive because
 * they are the only rows without a `rule`.
 */
export async function clusterBoardBy(ownerId: string, dimension: 'person' | 'place' | 'year' | 'kind') {
  const db = getDb()

  /**
   * Real joins, not correlated subqueries.
   *
   * Drizzle renders an interpolated column unqualified when the query has no
   * join — `${objects.id}` becomes `"id"`, which inside a subquery over
   * `people` binds to `people.id` instead. The comparison then never matches
   * and every row silently collapses into one group. Joining sidesteps the
   * whole class of bug and lets Postgres do the grouping.
   */
  const base = db
    .select({
      id: objects.id,
      label:
        dimension === 'person'
          ? sql<string>`coalesce(${people.name}, 'Nobody in particular')`
          : dimension === 'place'
            ? sql<string>`coalesce(${places.name}, 'Nowhere in particular')`
            : dimension === 'year'
              ? sql<string>`coalesce(to_char(${objects.receivedAt}, 'YYYY'), 'Undated')`
              : sql<string>`coalesce(replace(${objects.kind}, '_', ' '), 'Unsorted')`,
    })
    .from(objects)
    .leftJoin(
      objectPeople,
      and(eq(objectPeople.objectId, objects.id), eq(objectPeople.role, 'given_by')),
    )
    .leftJoin(people, eq(people.id, objectPeople.personId))
    .leftJoin(places, eq(places.id, objects.placeId))
    .where(eq(objects.ownerId, ownerId))
    .orderBy(asc(objects.lotNo))

  const rows = await base

  const groups = new Map<string, string[]>()
  for (const row of rows) {
    const list = groups.get(row.label) ?? []
    list.push(row.id)
    groups.set(row.label, list)
  }

  // Only generated clusters are disposable; a cluster the owner made by hand
  // has no rule and must never be swept away by a CLUSTER BY.
  await db
    .delete(collections)
    .where(
      and(
        eq(collections.ownerId, ownerId),
        eq(collections.kind, 'cluster'),
        sql`${collections.rule} is not null`,
      ),
    )

  const PER_ROW = 3
  const GAP = 60
  let index = 0

  for (const [name, ids] of groups) {
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(ids.length))))
    const rowsIn = Math.ceil(ids.length / cols)
    const width = cols * 170 + 40
    const height = rowsIn * 190 + 40
    const originX = 120 + (index % PER_ROW) * (560 + GAP)
    const originY = 120 + Math.floor(index / PER_ROW) * (520 + GAP)

    const [cluster] = await db
      .insert(collections)
      .values({
        ownerId,
        name,
        kind: 'cluster',
        rule: { clusterBy: dimension, label: name },
        boardX: originX,
        boardY: originY,
        boardW: width,
        boardH: height,
        impliedTags: [],
        sortOrder: index,
      })
      .returning()

    if (cluster) {
      await db.insert(collectionObjects).values(
        ids.map((objectId, order) => ({ collectionId: cluster.id, objectId, sortOrder: order })),
      )
    }

    for (const [i, id] of ids.entries()) {
      await db
        .update(objects)
        .set({
          boardX: originX + 24 + (i % cols) * 168,
          boardY: originY + 24 + Math.floor(i / cols) * 188,
          boardZ: 0,
        })
        .where(and(eq(objects.id, id), eq(objects.ownerId, ownerId)))
    }
    index++
  }

  return { clusters: groups.size, objects: rows.length }
}
