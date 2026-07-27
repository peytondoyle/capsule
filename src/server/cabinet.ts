import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import {
  collectionObjects,
  collections,
  objectFaces,
  objects,
} from './db/schema'

type ShelfObject = {
  id: string
  lotNo: number
  title: string
  kind: string | null
  silhouette: string
  cutStyle: string
  rotationDeg: number
  cutoutUrl: string | null
  faceW: number | null
  faceH: number | null
}

/**
 * The Cabinet's shelves: every `shelf` collection with its members, then an
 * implicit shelf for everything unshelved, then Unattributed — the unfiled
 * objects, dimmed, "AWAITING ENTRY". Nothing the owner has is allowed to be
 * invisible; a shelf you did not make is still a shelf.
 */
export async function getCabinet(ownerId: string) {
  const db = getDb()

  const face = {
    id: objects.id,
    lotNo: objects.lotNo,
    title: objects.title,
    kind: objects.kind,
    silhouette: objects.silhouette,
    cutStyle: objects.cutStyle,
    rotationDeg: objects.rotationDeg,
    cutoutUrl: objectFaces.cutoutUrl,
    faceW: objectFaces.width,
    faceH: objectFaces.height,
  }

  const unfiledPredicate = sql`(
    ${objects.placeId} is null
    and ${objects.receivedPrecision} = 'unknown'
    and not exists (
      select 1 from object_people op
      where op.object_id = ${objects.id} and op.role = 'given_by'
    )
  )`

  const [shelves, members, loose, unattributed] = await Promise.all([
    db
      .select()
      .from(collections)
      .where(and(eq(collections.ownerId, ownerId), eq(collections.kind, 'shelf')))
      .orderBy(asc(collections.sortOrder)),
    db
      .select({ collectionId: collectionObjects.collectionId, ...face })
      .from(collectionObjects)
      .innerJoin(objects, eq(objects.id, collectionObjects.objectId))
      .innerJoin(
        collections,
        and(
          eq(collections.id, collectionObjects.collectionId),
          eq(collections.kind, 'shelf'),
        ),
      )
      .leftJoin(
        objectFaces,
        and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')),
      )
      .where(eq(objects.ownerId, ownerId))
      .orderBy(asc(collectionObjects.sortOrder)),
    db
      .select(face)
      .from(objects)
      .leftJoin(
        objectFaces,
        and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')),
      )
      .where(
        and(
          eq(objects.ownerId, ownerId),
          sql`not exists (
            select 1 from ${collectionObjects} co
            join ${collections} c on c.id = co.collection_id and c.kind = 'shelf'
            where co.object_id = ${objects.id}
          )`,
          sql`not ${unfiledPredicate}`,
        ),
      )
      .orderBy(asc(objects.lotNo)),
    db
      .select(face)
      .from(objects)
      .leftJoin(
        objectFaces,
        and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')),
      )
      .where(and(eq(objects.ownerId, ownerId), unfiledPredicate))
      .orderBy(asc(objects.lotNo)),
  ])

  const byShelf = new Map<string, ShelfObject[]>()
  for (const row of members) {
    const { collectionId, ...object } = row
    const list = byShelf.get(collectionId) ?? []
    list.push(object)
    byShelf.set(collectionId, list)
  }

  const named = shelves.map((shelf) => ({
    id: shelf.id,
    name: shelf.name,
    objects: byShelf.get(shelf.id) ?? [],
    dim: false,
  }))

  return [
    ...named,
    ...(loose.length
      ? [{ id: 'loose', name: 'Elsewhere', objects: loose, dim: false }]
      : []),
    ...(unattributed.length
      ? [{ id: 'unattributed', name: 'Unattributed', objects: unattributed, dim: true }]
      : []),
  ]
}
