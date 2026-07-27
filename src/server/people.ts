import 'server-only'

import { and, count, desc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import { objectFaces, objectPeople, objects, people } from './db/schema'

function initialsFrom(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export async function upsertPerson(ownerId: string, name: string) {
  const trimmed = name.trim()
  const [row] = await getDb()
    .insert(people)
    .values({ ownerId, name: trimmed, initials: initialsFrom(trimmed) })
    .onConflictDoUpdate({
      target: [people.ownerId, people.nameKey],
      set: { name: trimmed, updatedAt: new Date() },
    })
    .returning()
  return row!
}

/** The Ledger rail's GIVEN BY list: initial-avatar, name, right-aligned count. */
export async function listPeopleWithCounts(ownerId: string) {
  return getDb()
    .select({
      id: people.id,
      name: people.name,
      initials: people.initials,
      avatarUrl: people.avatarUrl,
      objectCount: count(objectPeople.objectId),
    })
    .from(people)
    .leftJoin(
      objectPeople,
      and(eq(objectPeople.personId, people.id), eq(objectPeople.role, 'given_by')),
    )
    .where(eq(people.ownerId, ownerId))
    .groupBy(people.id)
    .orderBy(desc(count(objectPeople.objectId)), people.name)
}

/**
 * "28 more from Dad / 2003 — 2024" on the phone object view.
 * Years come from received_at, so objects with an unknown date do not widen the
 * range with a null.
 */
export async function getPersonStats(ownerId: string, personId: string) {
  const [row] = await getDb()
    .select({
      id: people.id,
      name: people.name,
      objectCount: count(objects.id),
      firstYear: sql<number | null>`min(extract(year from ${objects.receivedAt}))::int`,
      lastYear: sql<number | null>`max(extract(year from ${objects.receivedAt}))::int`,
    })
    .from(people)
    .leftJoin(
      objectPeople,
      and(eq(objectPeople.personId, people.id), eq(objectPeople.role, 'given_by')),
    )
    .leftJoin(
      objects,
      and(eq(objects.id, objectPeople.objectId), eq(objects.ownerId, ownerId)),
    )
    .where(and(eq(people.ownerId, ownerId), eq(people.id, personId)))
    .groupBy(people.id)

  return row ?? null
}

/** A person's objects, newest first, with recto faces — the /people/[id] runs. */
export async function listObjectsByPerson(ownerId: string, personId: string) {
  return getDb()
    .select({
      object: objects,
      recto: {
        id: objectFaces.id,
        cutoutUrl: objectFaces.cutoutUrl,
        width: objectFaces.width,
        height: objectFaces.height,
      },
    })
    .from(objectPeople)
    .innerJoin(objects, and(eq(objects.id, objectPeople.objectId), eq(objects.ownerId, ownerId)))
    .leftJoin(objectFaces, and(eq(objectFaces.objectId, objects.id), eq(objectFaces.role, 'recto')))
    .where(and(eq(objectPeople.personId, personId), eq(objectPeople.role, 'given_by')))
    .orderBy(sql`${objects.receivedAt} desc nulls last`, desc(objects.createdAt))
}

export async function getPerson(ownerId: string, personId: string) {
  const [row] = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.ownerId, ownerId), eq(people.id, personId)))
    .limit(1)
  return row ?? null
}
