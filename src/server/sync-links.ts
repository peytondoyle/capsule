import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { isLinkField, personRoles, referenceIds, type LinkField, type LinkReference } from '@/lib/offline/links'
import type { DbTransaction } from './db/pool'
import { collectionObjects, collections, objectPeople, objectTags, objects, occasions, places, people, syncClientIds, tags } from './db/schema'

const tableFor = (field: LinkField) => field === 'atPlace' ? places : field === 'onOccasion' ? occasions : field === 'tagged' ? tags : field === 'inCollections' ? collections : people
const entityFor = (field: LinkField) => field === 'atPlace' ? 'place' : field === 'onOccasion' ? 'occasion' : field === 'tagged' ? 'tag' : field === 'inCollections' ? 'collection' : 'person'

export async function readObjectLinks(db: DbTransaction, ownerId: string, id: string) {
  const persons = await db.select({ id: people.id, name: people.name, role: objectPeople.role }).from(objectPeople).innerJoin(people, and(eq(people.id, objectPeople.personId), eq(people.ownerId, ownerId))).where(eq(objectPeople.objectId, id))
  const tagged = await db.select({ id: tags.id, name: tags.name }).from(objectTags).innerJoin(tags, and(eq(tags.id, objectTags.tagId), eq(tags.ownerId, ownerId))).where(eq(objectTags.objectId, id))
  const inCollections = await db.select({ id: collections.id, name: collections.name }).from(collectionObjects).innerJoin(collections, and(eq(collections.id, collectionObjects.collectionId), eq(collections.ownerId, ownerId), ne(collections.kind, 'smart'))).where(eq(collectionObjects.objectId, id))
  const [location] = await db.select({ placeId: places.id, placeName: places.name, occasionId: occasions.id, occasionName: occasions.name }).from(objects).leftJoin(places, and(eq(places.id, objects.placeId), eq(places.ownerId, ownerId))).leftJoin(occasions, and(eq(occasions.id, objects.occasionId), eq(occasions.ownerId, ownerId))).where(and(eq(objects.id, id), eq(objects.ownerId, ownerId)))
  return { atPlace: location?.placeId ? [{ id: location.placeId, name: location.placeName! }] : [], onOccasion: location?.occasionId ? [{ id: location.occasionId, name: location.occasionName! }] : [], ...Object.fromEntries(Object.entries(personRoles).map(([field, role]) => [field, persons.filter(person => person.role === role).map(({ id, name }) => ({ id, name }))])), tagged, inCollections }
}

async function mappedId(db: DbTransaction, ownerId: string, field: LinkField, id: string) {
  const [mapped] = await db.select({ id: syncClientIds.serverId }).from(syncClientIds).where(and(eq(syncClientIds.ownerId, ownerId), eq(syncClientIds.entity, entityFor(field)), eq(syncClientIds.clientId, id)))
  return mapped?.id
}

export async function linkBaseline(db: DbTransaction, ownerId: string, field: LinkField, value: unknown) {
  const ids = referenceIds(value)
  return [...new Set(await Promise.all(ids.map(async id => await mappedId(db, ownerId, field, id) ?? id)))].sort()
}

export async function canWriteLinks(db: DbTransaction, ownerId: string, changes: Record<string, unknown>) {
  for (const [field, value] of Object.entries(changes)) {
    if (!isLinkField(field)) continue
    const table = tableFor(field)
    for (const ref of value as LinkReference[]) {
      const mapped = await mappedId(db, ownerId, field, ref.id)
      const [row] = await db.select().from(table).where(eq(table.id, mapped ?? ref.id)).limit(1)
      if (row ? row.ownerId !== ownerId || (field === 'inCollections' && 'kind' in row && row.kind === 'smart') : mapped || !ref.create) return false
    }
  }
  return true
}

async function ensureReference(db: DbTransaction, ownerId: string, field: LinkField, ref: LinkReference) {
  const table = tableFor(field), mapped = await mappedId(db, ownerId, field, ref.id)
  const [existing] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, mapped ?? ref.id), eq(table.ownerId, ownerId))).limit(1)
  if (existing) return existing.id
  if (!ref.create || mapped) throw new Error('This archive reference changed while syncing.')
  const name = ref.name.trim()
  let id: string
  if (field === 'inCollections') {
    const [created] = await db.insert(collections).values({ id: ref.id, ownerId, name, kind: 'shelf' }).returning({ id: collections.id })
    id = created!.id
  } else {
    const dictionary = field === 'atPlace' ? places : field === 'onOccasion' ? occasions : field === 'tagged' ? tags : people
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
    await db.insert(dictionary).values({ id: ref.id, ownerId, name, ...(field === 'givenBy' || field === 'depicted' || field === 'mentioned' ? { initials } : {}) }).onConflictDoNothing({ target: [dictionary.ownerId, dictionary.nameKey] })
    const [saved] = await db.select({ id: dictionary.id }).from(dictionary).where(and(eq(dictionary.ownerId, ownerId), eq(dictionary.nameKey, sql`lower(${name})`))).limit(1)
    if (!saved) throw new Error('The archive name changed while syncing.')
    id = saved.id
  }
  await db.insert(syncClientIds).values({ ownerId, entity: entityFor(field), clientId: ref.id, serverId: id }).onConflictDoNothing()
  return id
}

export async function writeObjectLinks(db: DbTransaction, ownerId: string, objectId: string, changes: Record<string, unknown>) {
  for (const [field, value] of Object.entries(changes)) {
    if (!isLinkField(field)) continue
    const ids = [...new Set(await Promise.all((value as LinkReference[]).map(ref => ensureReference(db, ownerId, field, ref))))]
    if (field === 'atPlace' || field === 'onOccasion') {
      await db.update(objects).set(field === 'atPlace' ? { placeId: ids[0] ?? null } : { occasionId: ids[0] ?? null }).where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
    } else if (field === 'tagged') {
      await db.delete(objectTags).where(eq(objectTags.objectId, objectId))
      if (ids.length) await db.insert(objectTags).values(ids.map(tagId => ({ objectId, tagId })))
    } else if (field === 'inCollections') {
      const previous = await db.select({ collectionId: collectionObjects.collectionId, sortOrder: collectionObjects.sortOrder }).from(collectionObjects).innerJoin(collections, and(eq(collections.id, collectionObjects.collectionId), eq(collections.ownerId, ownerId), ne(collections.kind, 'smart'))).where(eq(collectionObjects.objectId, objectId))
      for (const link of previous) if (!ids.includes(link.collectionId)) await db.delete(collectionObjects).where(and(eq(collectionObjects.objectId, objectId), eq(collectionObjects.collectionId, link.collectionId)))
      for (const collectionId of ids) if (!previous.some(link => link.collectionId === collectionId)) await db.insert(collectionObjects).values({ objectId, collectionId })
    } else {
      await db.delete(objectPeople).where(and(eq(objectPeople.objectId, objectId), eq(objectPeople.role, personRoles[field])))
      if (ids.length) await db.insert(objectPeople).values(ids.map(personId => ({ objectId, personId, role: personRoles[field] })))
    }
  }
}
