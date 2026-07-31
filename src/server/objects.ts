import 'server-only'

import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm'

import { getDb } from './db'
import { getTxDb } from './db/pool'
import {
  objectFaces,
  objectPeople,
  objectTags,
  objects,
  people,
  places,
  type ObjectKind,
} from './db/schema'
import { upsertPerson } from './people'
import { upsertTag } from './taxonomy'

type Silhouette = (typeof objects.$inferInsert)['silhouette']
type CutStyle = (typeof objects.$inferInsert)['cutStyle']
type DatePrecision = (typeof objects.$inferInsert)['receivedPrecision']
type Retention = (typeof objects.$inferInsert)['retention']

export type NewObject = {
  title: string
  kind?: ObjectKind | null
  silhouette?: Silhouette
  cutStyle?: CutStyle
  /** Omit to get a deterministic jitter derived from the object's own id. */
  rotationDeg?: number
  receivedAt?: string | null
  receivedPrecision?: DatePrecision
  placeId?: string | null
  occasionId?: string | null
  story?: string | null
  retention?: Retention
  retainedLocation?: string | null
  material?: string | null
  widthMm?: number | null
  heightMm?: number | null
  personIds?: string[]
  tagIds?: string[]
}

/**
 * Stable per-object rotation in the design's -6°…+9° range.
 *
 * Derived from the id rather than stored random so it never changes, and
 * computed rather than left at 0 so a freshly seeded archive already looks
 * hand-placed. Callers can override.
 */
function jitterFrom(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.round(((Math.abs(hash) % 1500) / 100 - 6) * 10) / 10
}

/**
 * Allocates the next lot number and inserts the object in one transaction.
 *
 * The counter row is created on conflict so a user whose `owner_counters` row is
 * somehow missing still gets lot 1 rather than a silent no-op UPDATE.
 */
export async function createObject(ownerId: string, input: NewObject) {
  return getTxDb().transaction(async (tx) => {
    const allocated = await tx.execute<{ lot_no: number }>(sql`
      insert into owner_counters (owner_id, next_lot)
      values (${ownerId}, 2)
      on conflict (owner_id) do update set next_lot = owner_counters.next_lot + 1
      returning next_lot - 1 as lot_no
    `)

    const lotNo = allocated.rows[0]?.lot_no
    if (lotNo === undefined) throw new Error('could not allocate a lot number')

    const [row] = await tx
      .insert(objects)
      .values({
        ownerId,
        lotNo,
        title: input.title,
        kind: input.kind ?? null,
        silhouette: input.silhouette ?? 'card',
        cutStyle: input.cutStyle ?? 'edge',
        rotationDeg: 0,
        receivedAt: input.receivedAt ?? null,
        receivedPrecision: input.receivedPrecision ?? (input.receivedAt ? 'day' : 'unknown'),
        placeId: input.placeId ?? null,
        occasionId: input.occasionId ?? null,
        story: input.story ?? null,
        retention: input.retention ?? 'retained',
        retainedLocation: input.retainedLocation ?? null,
        material: input.material ?? null,
        widthMm: input.widthMm ?? null,
        heightMm: input.heightMm ?? null,
      })
      .returning()

    if (!row) throw new Error('insert returned no row')

    const rotationDeg = input.rotationDeg ?? jitterFrom(row.id)
    if (rotationDeg !== row.rotationDeg) {
      await tx.update(objects).set({ rotationDeg }).where(eq(objects.id, row.id))
      row.rotationDeg = rotationDeg
    }

    if (input.personIds?.length) {
      await tx
        .insert(objectPeople)
        .values(input.personIds.map((personId) => ({ objectId: row.id, personId })))
        .onConflictDoNothing()
    }

    if (input.tagIds?.length) {
      await tx
        .insert(objectTags)
        .values(input.tagIds.map((tagId) => ({ objectId: row.id, tagId })))
        .onConflictDoNothing()
    }

    return row
  })
}

/**
 * An object is unfiled when nobody gave it, it came from nowhere, and it has no
 * date. Drives the rust `7` on the Ledger rail, the Board's "still unfiled"
 * chip, the Cabinet's "AWAITING ENTRY" shelf, and the PWA app badge.
 */
const unfiledPredicate = and(
  isNull(objects.placeId),
  eq(objects.receivedPrecision, 'unknown'),
  sql`not exists (
    select 1 from ${objectPeople}
    where ${objectPeople.objectId} = ${objects.id}
      and ${objectPeople.role} = 'given_by'
  )`,
)

export async function countUnfiled(ownerId: string) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(objects)
    .where(and(eq(objects.ownerId, ownerId), unfiledPredicate))
  return row?.value ?? 0
}

export async function listUnfiled(ownerId: string, limit = 50) {
  return getDb()
    .select()
    .from(objects)
    .where(and(eq(objects.ownerId, ownerId), unfiledPredicate))
    .orderBy(asc(objects.createdAt))
    .limit(limit)
}

/**
 * The Ledger's spine. Objects with an unknown date are excluded rather than
 * dropped into a fabricated month — they live in Unfiled until someone says
 * when.
 *
 * The limit is a runaway guard, not pagination: silently truncating an archive
 * would quietly hide a person's oldest objects, which is the one failure this
 * app must never have. Real pagination lands with a visible affordance or not
 * at all.
 */
export type TimelineSort = 'newest' | 'oldest'

export async function listTimeline(
  ownerId: string,
  { sort = 'newest', limit = 5000 }: { sort?: TimelineSort; limit?: number } = {},
) {
  // Ordered on received_at, not created_at: the Ledger's spine is when the
  // object was *given*, not when it was photographed. createdAt only breaks
  // ties, and follows the same direction so a run of same-day objects does not
  // reverse relative to its own year heading.
  const direction = sort === 'oldest' ? asc : desc

  return getDb()
    .select({
      object: objects,
      recto: {
        // `id` must come first: drizzle decides whether a left-joined group is
        // null from its first selected column, and every other column here is
        // legitimately null between intake and phase 6 filling in the URLs.
        id: objectFaces.id,
        cutoutUrl: objectFaces.cutoutUrl,
        thumbUrl: objectFaces.thumbUrl,
        width: objectFaces.width,
        height: objectFaces.height,
      },
      // The caption under every cutout reads "NINA · 09 APR", so the giver has
      // to come back with the row. A correlated subquery rather than a join,
      // which would multiply rows for objects with more than one person.
      giver: sql<string | null>`(
        select p.name
        from ${objectPeople} op
        join ${people} p on p.id = op.person_id
        where op.object_id = ${objects.id} and op.role = 'given_by'
        order by p.name
        limit 1
      )`,
    })
    .from(objects)
    .leftJoin(
      objectFaces,
      and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')),
    )
    .where(
      and(
        eq(objects.ownerId, ownerId),
        sql`${objects.receivedPrecision} <> 'unknown'`,
      ),
    )
    .orderBy(direction(objects.receivedAt), direction(objects.createdAt))
    .limit(limit)
}

export async function getObjectByLot(ownerId: string, lotNo: number) {
  const [row] = await getDb()
    .select()
    .from(objects)
    .where(and(eq(objects.ownerId, ownerId), eq(objects.lotNo, lotNo)))
    .limit(1)
  if (!row) return null

  const faces = await getDb()
    .select()
    .from(objectFaces)
    .where(eq(objectFaces.objectId, row.id))
    .orderBy(asc(objectFaces.sortOrder))

  return { ...row, faces }
}

/**
 * Backs the Ledger's "search 412 objects" and, literally, the Cabinet's
 * "lot no., person, place" — so it has to reach the giver and the origin, not
 * just the object's own text. The ilike patterns ride the pg_trgm GIN indexes.
 */
export async function searchObjects(ownerId: string, query: string, limit = 40) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const like = `%${trimmed}%`
  // "OBJ-0147" / "LOT 0147" / "147" all mean lot 147.
  const asLot = Number.parseInt(trimmed.replace(/^\D+/, ''), 10)

  return getDb()
    .select({
      object: objects,
      recto: {
        id: objectFaces.id,
        cutoutUrl: objectFaces.cutoutUrl,
        thumbUrl: objectFaces.thumbUrl,
        width: objectFaces.width,
        height: objectFaces.height,
      },
      giver: sql<string | null>`(
        select p.name from ${objectPeople} op
        join ${people} p on p.id = op.person_id
        where op.object_id = ${objects.id} and op.role = 'given_by'
        order by p.name limit 1
      )`,
    })
    .from(objects)
    .leftJoin(objectFaces, and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')))
    .where(
      and(
        eq(objects.ownerId, ownerId),
        or(
          Number.isNaN(asLot) ? undefined : eq(objects.lotNo, asLot),
          sql`${objects.title} ilike ${like}`,
          sql`${objects.story} ilike ${like}`,
          sql`exists (
            select 1 from ${people}
            join ${objectPeople} on ${objectPeople.personId} = ${people.id}
            where ${objectPeople.objectId} = ${objects.id}
              and ${people.name} ilike ${like}
          )`,
          sql`exists (
            select 1 from ${places}
            where ${places.id} = ${objects.placeId}
              and ${places.name} ilike ${like}
          )`,
          sql`exists (
            select 1 from occasions oc
            where oc.id = ${objects.occasionId}
              and oc.name ilike ${like}
          )`,
        ),
      ),
    )
    .orderBy(sql`${objects.receivedAt} desc nulls last`)
    .limit(limit)
}

export async function updateObject(
  ownerId: string,
  objectId: string,
  patch: Partial<typeof objects.$inferInsert>,
) {
  const { id: _id, ownerId: _ownerId, lotNo: _lotNo, ...safe } = patch
  const [row] = await getDb()
    .update(objects)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
    .returning()
  return row ?? null
}

/** Board drag-end. Owner-scoped so a stray id cannot move someone else's object. */
export async function moveObject(
  ownerId: string,
  objectId: string,
  position: { x: number; y: number; z?: number },
) {
  await getDb()
    .update(objects)
    .set({
      boardX: position.x,
      boardY: position.y,
      ...(position.z === undefined ? {} : { boardZ: position.z }),
      updatedAt: new Date(),
    })
    .where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
}

/**
 * Deletes an object and the bytes behind it.
 *
 * The DB cascade removes object_faces, but a blob has no foreign key — without
 * this the originals and derivatives sit in both stores forever, billed and
 * unreachable. Blob deletes happen first and failures are swallowed: a leaked
 * blob is recoverable by a sweep, whereas refusing to delete the row would
 * leave the owner unable to remove their own object.
 */
export async function deleteObject(ownerId: string, objectId: string) {
  await assertOwned(ownerId, objectId)

  const faces = await getDb()
    .select({ originalUrl: objectFaces.originalUrl, cutoutUrl: objectFaces.cutoutUrl, thumbUrl: objectFaces.thumbUrl, maskUrl: objectFaces.maskUrl })
    .from(objectFaces)
    .where(eq(objectFaces.objectId, objectId))

  const { deleteBlobs } = await import('./blob')
  await deleteBlobs({
    originals: faces.map((f) => f.originalUrl),
    media: faces.flatMap((f) => [f.cutoutUrl, f.thumbUrl, f.maskUrl]),
  })

  await getDb()
    .delete(objects)
    .where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
}

/**
 * Confirms an object belongs to the owner before anything mutates it.
 *
 * Every write path calls this. With RLS gone, a stray or forged object id is
 * the whole attack surface, and "the caller passed us an id" is not evidence of
 * anything.
 */
export async function assertOwned(ownerId: string, objectId: string) {
  const [row] = await getDb()
    .select({ id: objects.id, lotNo: objects.lotNo })
    .from(objects)
    .where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
    .limit(1)
  if (!row) throw new Error('object not found')
  return row
}

/** Attaches a tag by name, creating it for this owner if it is new. */
export async function attachTag(ownerId: string, objectId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null

  await assertOwned(ownerId, objectId)
  const tag = await upsertTag(ownerId, trimmed)

  await getDb()
    .insert(objectTags)
    .values({ objectId, tagId: tag.id })
    .onConflictDoNothing()

  return tag
}

export async function detachTag(ownerId: string, objectId: string, tagId: string) {
  await assertOwned(ownerId, objectId)
  await getDb()
    .delete(objectTags)
    .where(and(eq(objectTags.objectId, objectId), eq(objectTags.tagId, tagId)))
}

/** Sets the giver. One primary giver per object in the UI, so this replaces. */
export async function setGiver(ownerId: string, objectId: string, personName: string | null) {
  await assertOwned(ownerId, objectId)
  const db = getDb()

  await db
    .delete(objectPeople)
    .where(and(eq(objectPeople.objectId, objectId), eq(objectPeople.role, 'given_by')))

  if (!personName?.trim()) return null

  const person = await upsertPerson(ownerId, personName)
  await db
    .insert(objectPeople)
    .values({ objectId, personId: person.id, role: 'given_by' })
    .onConflictDoNothing()

  return person
}
