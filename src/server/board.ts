import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import {
  collectionObjects,
  collections,
  objectFaces,
  objectPeople,
  objects,
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
