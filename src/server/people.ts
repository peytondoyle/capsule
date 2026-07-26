import 'server-only'

import { and, count, desc, eq, sql } from 'drizzle-orm'

import { getDb } from './db'
import { objectPeople, objects, people } from './db/schema'

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
