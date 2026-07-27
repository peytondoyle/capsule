import 'server-only'

import { randomBytes } from 'node:crypto'
import { and, eq, isNull, or, sql } from 'drizzle-orm'

import { getDb } from './db'
import {
  objectFaces,
  objectPeople,
  objects,
  occasions,
  people,
  places,
  shares,
} from './db/schema'
import { assertOwned } from './objects'

/** One live link per object; asking again returns the same token. */
export async function createObjectShare(ownerId: string, objectId: string) {
  await assertOwned(ownerId, objectId)
  const db = getDb()

  const [existing] = await db
    .select()
    .from(shares)
    .where(
      and(
        eq(shares.ownerId, ownerId),
        eq(shares.objectId, objectId),
        or(isNull(shares.expiresAt), sql`${shares.expiresAt} > now()`),
      ),
    )
    .limit(1)
  if (existing) return existing

  const [row] = await db
    .insert(shares)
    .values({
      ownerId,
      objectId,
      scope: 'object',
      token: randomBytes(16).toString('base64url'),
    })
    .returning()
  return row!
}

export async function revokeObjectShare(ownerId: string, objectId: string) {
  await getDb()
    .delete(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.objectId, objectId)))
}

/**
 * The public read. No ownerId — the token is the capability. What it returns
 * is deliberately narrower than the owner's view: no lot number, no retention
 * location (where you keep a thing in your house is nobody's business), no
 * tags. The five fields and the picture; that is the gift being shared.
 */
export async function getSharedObject(token: string) {
  const db = getDb()

  const [share] = await db
    .select()
    .from(shares)
    .where(
      and(
        eq(shares.token, token),
        eq(shares.scope, 'object'),
        or(isNull(shares.expiresAt), sql`${shares.expiresAt} > now()`),
      ),
    )
    .limit(1)
  if (!share?.objectId) return null

  const [row] = await db
    .select({
      object: objects,
      placeName: places.name,
      occasionName: occasions.name,
      giver: sql<string | null>`(
        select p.name from ${objectPeople} op
        join ${people} p on p.id = op.person_id
        where op.object_id = ${objects.id} and op.role = 'given_by'
        order by p.name limit 1
      )`,
    })
    .from(objects)
    .leftJoin(places, eq(places.id, objects.placeId))
    .leftJoin(occasions, eq(occasions.id, objects.occasionId))
    .where(eq(objects.id, share.objectId))
    .limit(1)
  if (!row) return null

  const faces = await db
    .select({
      id: objectFaces.id,
      role: objectFaces.role,
      cutoutUrl: objectFaces.cutoutUrl,
      width: objectFaces.width,
      height: objectFaces.height,
    })
    .from(objectFaces)
    .where(eq(objectFaces.objectId, share.objectId))
    .orderBy(objectFaces.sortOrder)

  return {
    title: row.object.title,
    kind: row.object.kind,
    silhouette: row.object.silhouette,
    cutStyle: row.object.cutStyle,
    rotationDeg: row.object.rotationDeg,
    receivedAt: row.object.receivedAt,
    receivedPrecision: row.object.receivedPrecision,
    story: row.object.story,
    retention: row.object.retention,
    placeName: row.placeName,
    occasionName: row.occasionName,
    giver: row.giver,
    faces,
  }
}
