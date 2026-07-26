import 'server-only'

import { asc, count, desc, eq } from 'drizzle-orm'

import { getDb } from './db'
import { objectTags, objects, occasions, places, tags } from './db/schema'

/**
 * Places, occasions and tags are all the same shape: an owner-scoped dictionary
 * keyed case-insensitively by name. Intake writes into them constantly ("The
 * Fillmore, SF" arriving from OCR), so every write is an upsert rather than a
 * lookup-then-insert race.
 */

export async function upsertPlace(
  ownerId: string,
  name: string,
  coords?: { lat: number; lng: number },
) {
  const trimmed = name.trim()
  const [row] = await getDb()
    .insert(places)
    .values({ ownerId, name: trimmed, lat: coords?.lat, lng: coords?.lng })
    .onConflictDoUpdate({
      target: [places.ownerId, places.nameKey],
      set: {
        name: trimmed,
        // Never blank out coordinates we already have with an un-geocoded write.
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        updatedAt: new Date(),
      },
    })
    .returning()
  return row!
}

export async function upsertOccasion(ownerId: string, name: string) {
  const trimmed = name.trim()
  const [row] = await getDb()
    .insert(occasions)
    .values({ ownerId, name: trimmed })
    .onConflictDoUpdate({
      target: [occasions.ownerId, occasions.nameKey],
      set: { name: trimmed },
    })
    .returning()
  return row!
}

export async function upsertTag(ownerId: string, name: string) {
  const trimmed = name.trim()
  const [row] = await getDb()
    .insert(tags)
    .values({ ownerId, name: trimmed })
    .onConflictDoUpdate({
      target: [tags.ownerId, tags.nameKey],
      set: { name: trimmed },
    })
    .returning()
  return row!
}

export async function listPlacesWithCounts(ownerId: string) {
  return getDb()
    .select({
      id: places.id,
      name: places.name,
      lat: places.lat,
      lng: places.lng,
      objectCount: count(objects.id),
    })
    .from(places)
    .leftJoin(objects, eq(objects.placeId, places.id))
    .where(eq(places.ownerId, ownerId))
    .groupBy(places.id)
    .orderBy(desc(count(objects.id)), asc(places.name))
}

export async function listOccasionsWithCounts(ownerId: string) {
  return getDb()
    .select({
      id: occasions.id,
      name: occasions.name,
      objectCount: count(objects.id),
    })
    .from(occasions)
    .leftJoin(objects, eq(objects.occasionId, occasions.id))
    .where(eq(occasions.ownerId, ownerId))
    .groupBy(occasions.id)
    .orderBy(desc(count(objects.id)), asc(occasions.name))
}

export async function listTagsWithCounts(ownerId: string) {
  return getDb()
    .select({
      id: tags.id,
      name: tags.name,
      objectCount: count(objectTags.objectId),
    })
    .from(tags)
    .leftJoin(objectTags, eq(objectTags.tagId, tags.id))
    .where(eq(tags.ownerId, ownerId))
    .groupBy(tags.id)
    .orderBy(desc(count(objectTags.objectId)), asc(tags.name))
}
