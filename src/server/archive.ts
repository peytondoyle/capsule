import 'server-only'

import { and, desc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import {
  objectFaces,
  objectPeople,
  objectTags,
  objects,
  occasions,
  people,
  places,
  tags,
} from './db/schema'
import { countUnfiled } from './objects'

/**
 * The numbers along the Ledger's left rail: "412 OBJECTS · 38 PEOPLE", the
 * per-nav counts, and the rust Unfiled figure.
 *
 * One round trip for the aggregates, plus the unfiled predicate which needs its
 * own NOT EXISTS. `lastAddedAt` comes from objects rather than the activity
 * table so it is right even for archives seeded or imported in bulk.
 */
export async function getArchiveSummary(ownerId: string) {
  const db = getDb()

  const [row] = await db
    .select({
      objects: sql<number>`(select count(*)::int from ${objects} where ${objects.ownerId} = ${ownerId})`,
      people: sql<number>`(select count(*)::int from ${people} where ${people.ownerId} = ${ownerId})`,
      places: sql<number>`(select count(*)::int from ${places} where ${places.ownerId} = ${ownerId})`,
      occasions: sql<number>`(select count(*)::int from ${occasions} where ${occasions.ownerId} = ${ownerId})`,
      tags: sql<number>`(select count(*)::int from ${tags} where ${tags.ownerId} = ${ownerId})`,
      lastAddedAt: sql<string | null>`(select max(${objects.createdAt}) from ${objects} where ${objects.ownerId} = ${ownerId})`,
    })
    .from(sql`(select 1) as _`)

  const unfiled = await countUnfiled(ownerId)

  return {
    objects: row?.objects ?? 0,
    people: row?.people ?? 0,
    places: row?.places ?? 0,
    occasions: row?.occasions ?? 0,
    tags: row?.tags ?? 0,
    unfiled,
    lastAddedAt: row?.lastAddedAt ? new Date(row.lastAddedAt) : null,
  }
}

export type ArchiveSummary = Awaited<ReturnType<typeof getArchiveSummary>>

/**
 * Everything the inspector shows for one object: the five fields resolved to
 * names, the faces in order, the giver, and the tags.
 */
export async function getObjectDetail(ownerId: string, lotNo: number) {
  const db = getDb()

  const [row] = await db
    .select({
      object: objects,
      placeName: places.name,
      occasionName: occasions.name,
    })
    .from(objects)
    .leftJoin(places, eq(places.id, objects.placeId))
    .leftJoin(occasions, eq(occasions.id, objects.occasionId))
    .where(and(eq(objects.ownerId, ownerId), eq(objects.lotNo, lotNo)))
    .limit(1)

  if (!row) return null

  const [faces, givenBy, labels] = await Promise.all([
    db
      .select()
      .from(objectFaces)
      .where(eq(objectFaces.objectId, row.object.id))
      .orderBy(objectFaces.sortOrder),
    db
      .select({ id: people.id, name: people.name, initials: people.initials })
      .from(objectPeople)
      .innerJoin(people, eq(people.id, objectPeople.personId))
      .where(and(eq(objectPeople.objectId, row.object.id), eq(objectPeople.role, 'given_by'))),
    db
      .select({ id: tags.id, name: tags.name })
      .from(objectTags)
      .innerJoin(tags, eq(tags.id, objectTags.tagId))
      .where(eq(objectTags.objectId, row.object.id))
      .orderBy(tags.name),
  ])

  return {
    ...row.object,
    placeName: row.placeName,
    occasionName: row.occasionName,
    faces,
    givenBy,
    tags: labels,
  }
}

export type ObjectDetail = NonNullable<Awaited<ReturnType<typeof getObjectDetail>>>

/**
 * The lot number the Ledger should open on: most recently received, falling
 * back to most recently added for an archive with no dates yet.
 */
export async function getDefaultLot(ownerId: string) {
  const [row] = await getDb()
    .select({ lotNo: objects.lotNo })
    .from(objects)
    .where(eq(objects.ownerId, ownerId))
    // NULLS LAST matters: Postgres sorts nulls first on DESC, so without it
    // the Ledger opens on an undated, unfiled object every time.
    .orderBy(sql`${objects.receivedAt} desc nulls last`, desc(objects.createdAt))
    .limit(1)
  return row?.lotNo ?? null
}
