import 'server-only'

import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { isLinkField, singleLink, referenceIds, validReferences } from '@/lib/offline/links'
import { canWriteLinks, linkBaseline, readObjectLinks, writeObjectLinks } from './sync-links'
import type { SyncRequest, SyncResponse, SyncSnapshot } from '@/lib/offline/types'
import { personNote, validCoordinates, validCoordinateBase, placeCoordinates, sameCoordinates, type PlaceCoordinates } from '@/lib/offline/taxonomy'
import { shelfRemovalBase } from '@/lib/offline/shelves'
import { deletionBase } from '@/lib/offline/taxonomy-delete'
import { getTxDb, type DbTransaction } from './db/pool'
import { createObjectInTransaction, type NewObject } from './objects'
import {
  collectionObjects,
  collections,
  shares,
  objectFaces,
  objectPeople,
  objectTags,
  intakeItems,
  intakeBatches,
  objects,
  occasions,
  people,
  places,
  syncEntities,
  tags,
  syncOperations,
  syncClientIds,
  silhouetteEnum,
  cutStyleEnum,
  retentionEnum,
  datePrecisionEnum,
} from './db/schema'

type Row = Record<string, unknown> & { id: string }

async function versioned(db: DbTransaction, ownerId: string, entity: string, rows: Row[]) {
  const states = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, entity)))
  const revisions = new Map(states.map((state) => [state.entityId, state.revision]))
  return rows.map((row) => ({ ...row, revision: revisions.get(row.id) ?? 1 }))
}

/** Full snapshots deliberately avoid a timestamp cursor: deleted rows cannot be lost. */
export async function getSyncSnapshot(ownerId: string): Promise<SyncSnapshot> {
  return getTxDb().transaction(async (db) => {
    await db.execute(sql`set transaction isolation level repeatable read`)
    const [recordRows, faceRows, peopleRows, placeRows, occasionRows, tagRows, collectionRows, memberships, personLinks, tagLinks, pendingIntake, tombstones] = await Promise.all([
      db.select().from(objects).where(eq(objects.ownerId, ownerId)),
      db.select({ face: objectFaces }).from(objectFaces).innerJoin(objects, eq(objects.id, objectFaces.objectId)).where(eq(objects.ownerId, ownerId)),
      db.select().from(people).where(eq(people.ownerId, ownerId)),
      db.select().from(places).where(eq(places.ownerId, ownerId)),
      db.select().from(occasions).where(eq(occasions.ownerId, ownerId)),
      db.select().from(tags).where(eq(tags.ownerId, ownerId)),
      db.select().from(collections).where(eq(collections.ownerId, ownerId)),
      db.select({ collectionId: collectionObjects.collectionId, objectId: collectionObjects.objectId, sortOrder: collectionObjects.sortOrder }).from(collectionObjects).innerJoin(collections, eq(collections.id, collectionObjects.collectionId)).where(eq(collections.ownerId, ownerId)),
      db.select({ objectId: objectPeople.objectId, personId: objectPeople.personId, role: objectPeople.role }).from(objectPeople).innerJoin(objects, eq(objects.id, objectPeople.objectId)).where(eq(objects.ownerId, ownerId)),
      db.select({ objectId: objectTags.objectId, tagId: objectTags.tagId }).from(objectTags).innerJoin(objects, eq(objects.id, objectTags.objectId)).where(eq(objects.ownerId, ownerId)),
      db.select({ item: intakeItems }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeBatches.ownerId, ownerId), sql`${intakeItems.status} not in ('filed', 'skipped')`)),
      db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), isNotNull(syncEntities.deletedAt))),
    ])
    return {
      version: 1,
      ownerId,
      records: await versioned(db, ownerId, 'object', recordRows as Row[]),
      faces: await versioned(db, ownerId, 'face', faceRows.map((row) => row.face) as Row[]),
      people: await versioned(db, ownerId, 'person', peopleRows as Row[]),
      places: await versioned(db, ownerId, 'place', placeRows as Row[]),
      occasions: await versioned(db, ownerId, 'occasion', occasionRows as Row[]),
      tags: await versioned(db, ownerId, 'tag', tagRows as Row[]),
      collections: await versioned(db, ownerId, 'collection', collectionRows as Row[]),
      memberships,
      objectPeople: personLinks,
      objectTags: tagLinks,
      pendingIntake: pendingIntake.map((row) => row.item as Record<string, unknown> & { id: string }),
      tombstones: tombstones.map((row) => ({ entity: row.entity as SyncSnapshot['tombstones'][number]['entity'], id: row.entityId, revision: row.revision, deletedAt: row.deletedAt!.toISOString() })),
    }
  })
}

const enumFields: Record<string, readonly string[]> = {
  silhouette: silhouetteEnum.enumValues,
  cutStyle: cutStyleEnum.enumValues,
  retention: retentionEnum.enumValues,
  receivedPrecision: datePrecisionEnum.enumValues,
}
const textFields = new Set(['kind', 'story', 'retainedLocation', 'material'])
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
const taxonomyTable = { person: people, place: places, occasion: occasions } as const

function validValues(values: unknown, creating: boolean): values is Record<string, unknown> {
  if (!record(values) || !Object.keys(values).length || (creating && typeof values.title !== 'string')) return false
  if (('atPlace' in values && 'placeId' in values) || ('onOccasion' in values && 'occasionId' in values)) return false
  return Object.entries(values).every(([key, value]) => {
    if (isLinkField(key)) return !creating && validReferences(value, singleLink(key) ? 1 : 200)
    if (key === 'title') return typeof value === 'string' && value.trim().length > 0
    if (textFields.has(key)) return value === null || typeof value === 'string'
    const options = Object.hasOwn(enumFields, key) ? enumFields[key] : undefined
    if (options) return typeof value === 'string' && options.includes(value)
    if (key === 'placeId' || key === 'occasionId') return value === null || uuid(value)
    if (key === 'receivedAt') {
      if (value === null) return true
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
      const date = new Date(value)
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    }
    if (key === 'personIds' || key === 'tagIds') return creating && Array.isArray(value) && value.every(uuid)
    if (key === 'widthMm' || key === 'heightMm' || key === 'boardZ') {
      return (value === null && key !== 'boardZ') || (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2147483647)
    }
    if (key === 'rotationDeg' || key === 'boardX' || key === 'boardY') {
      return (value === null && key !== 'rotationDeg') || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 3.4e38)
    }
    return false
  })
}

async function ownsReferences(db: DbTransaction, ownerId: string, values: Record<string, unknown>) {
  for (const [key, table] of [['placeId', places], ['occasionId', occasions]] as const) {
    const id = values[key]
    if (typeof id === 'string') {
      const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.ownerId, ownerId)))
      if (!rows.length) return false
    }
  }
  for (const [key, table] of [['personIds', people], ['tagIds', tags]] as const) {
    const ids = values[key] as string[] | undefined
    if (ids?.length) {
      const rows = await db.select({ id: table.id }).from(table).where(and(inArray(table.id, ids), eq(table.ownerId, ownerId)))
      if (rows.length !== new Set(ids).size) return false
    }
  }
  return true
}

export async function applySyncMutation(ownerId: string, input: unknown): Promise<SyncResponse> {
  const operationId = record(input) && typeof input.operationId === 'string' ? input.operationId : ''
  const rejected: SyncResponse = { operationId, outcome: 'rejected' }
  if (!operationId || operationId.length > 200 || !record(input) || !record(input.mutation)) return rejected
  const mutation = input.mutation
  if (mutation.type === 'object.create') {
    if (!uuid(mutation.clientId) || !validValues(mutation.values, true)) return rejected
  } else if (mutation.type === 'object.patch') {
    if (!record(mutation.patch) || !uuid(mutation.patch.id) || !revision(mutation.patch.baseRevision) ||
      !record(mutation.patch.base) || !validValues(mutation.patch.changes, false)) return rejected
  } else if (mutation.type === 'object.delete') {
    if (!uuid(mutation.id) || !revision(mutation.baseRevision) || !record(mutation.base)) return rejected
  } else if (mutation.type === 'taxonomy.upsert') {
    if (typeof mutation.entity !== 'string' || !['person', 'place', 'occasion'].includes(mutation.entity) || !uuid(mutation.id) || !revision(mutation.baseRevision) || !record(mutation.base) || !record(mutation.values) || Object.keys(mutation.values).length !== 1) return rejected
    if (Object.hasOwn(mutation.values, 'coordinates')) {
      if (mutation.entity !== 'place' || !validCoordinateBase(mutation.base.coordinates) || !validCoordinates(mutation.values.coordinates)) return rejected
    } else if (Object.hasOwn(mutation.values, 'note')) {
      if (mutation.entity !== 'person' || !(mutation.base.note === null || typeof mutation.base.note === 'string') || !(mutation.values.note === null || typeof mutation.values.note === 'string' && mutation.values.note.length <= 20000)) return rejected
    } else if (typeof mutation.base.name !== 'string' || typeof mutation.values.name !== 'string' || !mutation.values.name.trim() || mutation.values.name.length > 250) return rejected
  } else if (mutation.type === 'collection.delete') {
    if (!uuid(mutation.id) || !revision(mutation.baseRevision) || !record(mutation.base) || !record(mutation.base.metadata) || !Array.isArray(mutation.base.links) || new Set(mutation.base.links).size !== mutation.base.links.length || !mutation.base.links.every(link => typeof link === 'string' && uuid(link.split(':')[0]) && /^-?\d+$/.test(link.split(':')[1] ?? '') && link.split(':').length === 2 && Number(link.split(':')[1]) >= -2147483648 && Number(link.split(':')[1]) <= 2147483647)) return rejected
  } else if (mutation.type === 'collection.reorder') {
    if (!Array.isArray(mutation.base) || mutation.base.length < 2 || !mutation.base.every(row => record(row) && uuid(row.id) && typeof row.sortOrder === 'number' && Number.isInteger(row.sortOrder) && row.sortOrder >= -2147483648 && row.sortOrder <= 2147483647) || !Array.isArray(mutation.ids) || mutation.ids.length !== mutation.base.length || new Set(mutation.ids).size !== mutation.ids.length || new Set(mutation.base.map(row => row.id)).size !== mutation.base.length) return rejected
    const baseIds = mutation.base.map(row => row.id)
    if (mutation.ids.some(id => !uuid(id) || !baseIds.includes(id))) return rejected
  } else if (mutation.type === 'collection.create') {
    if (!uuid(mutation.id) || !record(mutation.values) || Object.keys(mutation.values).length !== 1 || typeof mutation.values.name !== 'string' || !mutation.values.name.trim() || mutation.values.name.length > 250) return rejected
  } else if (mutation.type === 'collection.upsert') {
    if (!uuid(mutation.id) || !revision(mutation.baseRevision) || !record(mutation.base) || typeof mutation.base.name !== 'string' || !record(mutation.values) || Object.keys(mutation.values).length !== 1 || typeof mutation.values.name !== 'string' || !mutation.values.name.trim() || mutation.values.name.length > 250) return rejected
  } else if (mutation.type === 'occasion.merge') {
    if (!uuid(mutation.id) || !uuid(mutation.targetId) || mutation.id === mutation.targetId || !record(mutation.base)) return rejected
    for (const base of [mutation.base.source, mutation.base.target]) {
      if (!record(base) || !revision(base.revision) || !record(base.metadata) || typeof base.metadata.name !== 'string' || !Object.hasOwn(base.metadata, 'createdAt') || !Array.isArray(base.links) || !base.links.every(uuid)) return rejected
    }
  } else if (mutation.type === 'taxonomy.delete') {
    if (typeof mutation.entity !== 'string' || !['person', 'place', 'occasion'].includes(mutation.entity) || !uuid(mutation.id) || !revision(mutation.baseRevision) || !record(mutation.base) || !record(mutation.base.metadata) || !Array.isArray(mutation.base.links) || !mutation.base.links.every(link => typeof link === 'string')) return rejected
  } else return rejected

  const request = input as SyncRequest
  return getTxDb().transaction(async (db) => {
    // Serialize this owner's sync stream, including different operations for the same client ID.
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`)
    const [previous] = await db.select({ response: syncOperations.response }).from(syncOperations)
      .where(and(eq(syncOperations.ownerId, ownerId), eq(syncOperations.operationId, operationId))).limit(1)
    if (previous) return previous.response as SyncResponse

    const mutation = request.mutation
    let response: SyncResponse = rejected
    if (mutation.type === 'object.create') {
      const [mapped] = await db.select().from(syncClientIds)
        .where(and(eq(syncClientIds.ownerId, ownerId), eq(syncClientIds.entity, 'object'), eq(syncClientIds.clientId, mutation.clientId))).limit(1)
      if (mapped) {
        const [existing] = await db.select({ lotNo: objects.lotNo }).from(objects)
          .where(and(eq(objects.id, mapped.serverId), eq(objects.ownerId, ownerId))).limit(1)
        if (existing) response = { operationId, outcome: 'applied', mapping: { clientId: mutation.clientId, id: mapped.serverId, lotNo: existing.lotNo } }
      } else if (await ownsReferences(db, ownerId, mutation.values)) {
        const object = await createObjectInTransaction(ownerId, mutation.values as NewObject, db)
        const layout = Object.fromEntries(['boardX', 'boardY', 'boardZ'].filter((key) => key in mutation.values).map((key) => [key, mutation.values[key]]))
        if (Object.keys(layout).length) await db.update(objects).set(layout).where(eq(objects.id, object.id))
        await db.insert(syncEntities).values({ ownerId, entity: 'object', entityId: object.id, revision: 1 })
        await db.insert(syncClientIds).values({ ownerId, entity: 'object', clientId: mutation.clientId, serverId: object.id })
        response = { operationId, outcome: 'applied', mapping: { clientId: mutation.clientId, id: object.id, lotNo: object.lotNo } }
      }
    } else if (mutation.type === 'object.patch' || mutation.type === 'object.delete') {
      const id = mutation.type === 'object.patch' ? mutation.patch.id : mutation.id
      const [object] = await db.select().from(objects).where(and(eq(objects.id, id), eq(objects.ownerId, ownerId))).limit(1).for('update', { of: objects })
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'object'), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      const linked = object && mutation.type === 'object.patch' ? await readObjectLinks(db, ownerId, id) : {}
      const current = object ? { ...object, ...linked } : null
      const base = mutation.type === 'object.patch' ? mutation.patch.base : mutation.base!
      const fields = mutation.type === 'object.patch' ? Object.keys(mutation.patch.changes) : Object.keys(object ?? {})
      const conflicts: string[] = []
      for (const key of fields) {
        if (!Object.hasOwn(base, key) || (isLinkField(key)
          ? !validReferences(base[key]) || JSON.stringify(referenceIds(current?.[key as keyof typeof current])) !== JSON.stringify(await linkBaseline(db, ownerId, key, base[key]))
          : JSON.stringify(current?.[key as keyof typeof current]) !== JSON.stringify(base[key]))) conflicts.push(key)
      }
      if (!object || state?.deletedAt || conflicts.length || (mutation.type === 'object.delete' && currentRevision !== mutation.baseRevision)) {
        response = { operationId, outcome: 'conflict', conflict: { entity: 'object', id, revision: currentRevision, current, fields: conflicts } }
      } else if (mutation.type === 'object.patch') {
        if (await ownsReferences(db, ownerId, mutation.patch.changes) && await canWriteLinks(db, ownerId, mutation.patch.changes)) {
          await writeObjectLinks(db, ownerId, id, mutation.patch.changes)
          const scalarChanges = Object.fromEntries(Object.entries(mutation.patch.changes).filter(([key]) => !isLinkField(key)))
          await db.update(objects).set({ ...scalarChanges, updatedAt: new Date() }).where(and(eq(objects.id, id), eq(objects.ownerId, ownerId)))
          await db.insert(syncEntities).values({ ownerId, entity: 'object', entityId: id, revision: currentRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, updatedAt: new Date() } })
          response = { operationId, outcome: 'applied' }
        }
      } else {
        await db.delete(objects).where(and(eq(objects.id, id), eq(objects.ownerId, ownerId)))
        const deletedAt = new Date()
        await db.insert(syncEntities).values({ ownerId, entity: 'object', entityId: id, revision: currentRevision + 1, deletedAt }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, deletedAt, updatedAt: deletedAt } })
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'collection.delete') {
      const id = mutation.id
      const [current] = await db.select().from(collections).where(and(eq(collections.id, id), eq(collections.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'collection'), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      if (current && current.kind === 'shelf' && !state?.deletedAt) {
        const shared = await db.select({ id: shares.id, ownerId: shares.ownerId }).from(shares).where(eq(shares.collectionId, id))
        if (shared.length) response = { operationId, outcome: 'rejected', reason: 'shared_collection', shareIds: shared.filter(row => row.ownerId === ownerId).map(row => row.id).sort() }
        else {
          const members = await db.select().from(collectionObjects).where(eq(collectionObjects.collectionId, id)).orderBy(collectionObjects.objectId).for('update')
          const base = shelfRemovalBase(current, members.map(row => `${row.objectId}:${row.sortOrder}`))
          const expected = shelfRemovalBase(mutation.base.metadata, mutation.base.links)
          if (currentRevision !== mutation.baseRevision || !Object.keys(base.metadata).every(key => Object.hasOwn(mutation.base.metadata, key)) || JSON.stringify(base) !== JSON.stringify(expected)) response = { operationId, outcome: 'conflict', conflict: { entity: 'collection', id, revision: currentRevision, current: { ...current, revision: currentRevision }, fields: ['shelf', 'memberships'] } }
          else {
            await db.delete(collections).where(and(eq(collections.id, id), eq(collections.ownerId, ownerId)))
            const deletedAt = new Date()
            await db.insert(syncEntities).values({ ownerId, entity: 'collection', entityId: id, revision: currentRevision + 1, deletedAt }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, deletedAt, updatedAt: deletedAt } })
            response = { operationId, outcome: 'applied' }
          }
        }
      } else response = { operationId, outcome: 'conflict', conflict: { entity: 'collection', id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['shelf', 'memberships'] } }
    } else if (mutation.type === 'collection.reorder') {
      const rows = await db.select().from(collections).where(and(eq(collections.ownerId, ownerId), eq(collections.kind, 'shelf'))).orderBy(collections.id).for('update')
      const current = rows.map(row => ({ id: row.id, sortOrder: row.sortOrder }))
      const base = [...mutation.base].sort((a, b) => a.id.localeCompare(b.id))
      if (JSON.stringify(current) !== JSON.stringify(base)) {
        response = { operationId, outcome: 'conflict', conflict: { entity: 'collection', id: mutation.ids[0]!, revision: 1, current: null, fields: ['order'] } }
      } else {
        for (const row of rows) {
          const sortOrder = mutation.ids.indexOf(row.id)
          if (sortOrder === row.sortOrder) continue
          await db.update(collections).set({ sortOrder }).where(and(eq(collections.id, row.id), eq(collections.ownerId, ownerId)))
          await db.insert(syncEntities).values({ ownerId, entity: 'collection', entityId: row.id, revision: 2 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: sql`${syncEntities.revision} + 1`, updatedAt: new Date() } })
        }
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'collection.create') {
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'collection'), eq(syncEntities.entityId, mutation.id))).limit(1)
      const [mapping] = await db.select().from(syncClientIds).where(and(eq(syncClientIds.ownerId, ownerId), eq(syncClientIds.entity, 'collection'), eq(syncClientIds.clientId, mutation.id))).limit(1)
      if (!state && !mapping) {
        const [created] = await db.insert(collections).values({ id: mutation.id, ownerId, name: mutation.values.name.trim(), kind: 'shelf' }).onConflictDoNothing({ target: collections.id }).returning({ id: collections.id })
        if (created) {
          await db.insert(syncEntities).values({ ownerId, entity: 'collection', entityId: mutation.id, revision: 1 })
          await db.insert(syncClientIds).values({ ownerId, entity: 'collection', clientId: mutation.id, serverId: mutation.id })
          response = { operationId, outcome: 'applied' }
        }
      }
    } else if (mutation.type === 'collection.upsert') {
      const id = mutation.id!, name = (mutation.values.name as string).trim()
      const [current] = await db.select().from(collections).where(and(eq(collections.id, id), eq(collections.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'collection'), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      const conflict = { entity: 'collection' as const, id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['name'] }
      if (!current || state?.deletedAt) response = { operationId, outcome: 'conflict', conflict }
      else if (current.kind !== 'shelf') response = { operationId, outcome: 'rejected', conflict }
      else if (current.name === name) response = { operationId, outcome: 'applied' }
      else if (current.name !== mutation.base!.name) response = { operationId, outcome: 'conflict', conflict }
      else {
        await db.update(collections).set({ name, updatedAt: new Date() }).where(and(eq(collections.id, id), eq(collections.ownerId, ownerId)))
        await db.insert(syncEntities).values({ ownerId, entity: 'collection', entityId: id, revision: currentRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, updatedAt: new Date() } })
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'occasion.merge') {
      const ids = [mutation.id, mutation.targetId].sort()
      const rows = await db.select().from(occasions).where(and(eq(occasions.ownerId, ownerId), inArray(occasions.id, ids))).orderBy(asc(occasions.id)).for('update')
      const states = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'occasion'), inArray(syncEntities.entityId, ids)))
      const linked = await db.select({ id: objects.id, occasionId: objects.occasionId }).from(objects).where(and(eq(objects.ownerId, ownerId), inArray(objects.occasionId, ids))).orderBy(asc(objects.id)).for('update')
      const source = rows.find(row => row.id === mutation.id), target = rows.find(row => row.id === mutation.targetId)
      const sourceRevision = states.find(row => row.entityId === mutation.id)?.revision ?? 1
      const targetRevision = states.find(row => row.entityId === mutation.targetId)?.revision ?? 1
      const matches = (row: typeof source, expected: typeof mutation.base.source, currentRevision: number) => !!row && currentRevision === expected.revision && !states.find(state => state.entityId === row.id)?.deletedAt && JSON.stringify(deletionBase('occasion', row, linked.filter(link => link.occasionId === row.id).map(link => link.id))) === JSON.stringify(deletionBase('occasion', expected.metadata, expected.links))
      if (!matches(source, mutation.base.source, sourceRevision) || !matches(target, mutation.base.target, targetRevision)) {
        response = { operationId, outcome: 'conflict', conflict: { entity: 'occasion', id: mutation.id, revision: sourceRevision, current: source ? { ...source, revision: sourceRevision } : null, fields: ['source', 'target', 'links'] } }
      } else {
        const moved = linked.filter(row => row.occasionId === mutation.id)
        if (moved.length) {
          await db.update(objects).set({ occasionId: mutation.targetId, updatedAt: new Date() }).where(and(eq(objects.ownerId, ownerId), inArray(objects.id, moved.map(row => row.id))))
          for (const row of moved) await db.insert(syncEntities).values({ ownerId, entity: 'object', entityId: row.id, revision: 2 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: sql`${syncEntities.revision} + 1`, updatedAt: new Date() } })
        }
        await db.delete(occasions).where(and(eq(occasions.id, mutation.id), eq(occasions.ownerId, ownerId)))
        const deletedAt = new Date()
        await db.insert(syncEntities).values({ ownerId, entity: 'occasion', entityId: mutation.id, revision: sourceRevision + 1, deletedAt }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: sourceRevision + 1, deletedAt, updatedAt: deletedAt } })
        await db.insert(syncEntities).values({ ownerId, entity: 'occasion', entityId: mutation.targetId, revision: targetRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: targetRevision + 1, updatedAt: deletedAt } })
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'taxonomy.delete') {
      const { entity, id } = mutation, table = taxonomyTable[entity]
      // The parent lock also excludes new FK references until the deletion commits.
      const [current] = await db.select().from(table).where(and(eq(table.id, id), eq(table.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, entity), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      const links = entity === 'person'
        ? (await db.select({ objectId: objectPeople.objectId, role: objectPeople.role }).from(objectPeople).innerJoin(objects, eq(objects.id, objectPeople.objectId)).where(and(eq(objectPeople.personId, id), eq(objects.ownerId, ownerId))).for('update', { of: objectPeople })).map(link => `${link.objectId}:${link.role}`)
        : (await db.select({ id: objects.id }).from(objects).where(and(eq(entity === 'place' ? objects.placeId : objects.occasionId, id), eq(objects.ownerId, ownerId))).for('update')).map(row => row.id)
      const base = current ? deletionBase(entity, current, links) : null
      const expected = deletionBase(entity, mutation.base.metadata, mutation.base.links)
      const complete = Object.keys(base?.metadata ?? {}).every(key => Object.hasOwn(mutation.base.metadata, key))
      if (!current || state?.deletedAt || currentRevision !== mutation.baseRevision || !complete || JSON.stringify(base) !== JSON.stringify(expected)) {
        response = { operationId, outcome: 'conflict', conflict: { entity, id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['entry', 'links'] } }
      } else {
        await db.delete(table).where(and(eq(table.id, id), eq(table.ownerId, ownerId)))
        const deletedAt = new Date()
        await db.insert(syncEntities).values({ ownerId, entity, entityId: id, revision: currentRevision + 1, deletedAt }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, deletedAt, updatedAt: deletedAt } })
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'taxonomy.upsert' && mutation.entity === 'place' && Object.hasOwn(mutation.values, 'coordinates')) {
      const id = mutation.id!, value = mutation.values.coordinates as { lat: number; lng: number }
      const [current] = await db.select().from(places).where(and(eq(places.id, id), eq(places.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'place'), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      if (!current || state?.deletedAt || (!sameCoordinates(placeCoordinates(current), value) && !sameCoordinates(placeCoordinates(current), mutation.base!.coordinates as PlaceCoordinates))) {
        response = { operationId, outcome: 'conflict', conflict: { entity: 'place', id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['coordinates'] } }
      } else {
        if (!sameCoordinates(placeCoordinates(current), value)) {
          await db.update(places).set({ lat: value.lat, lng: value.lng, updatedAt: new Date() }).where(and(eq(places.id, id), eq(places.ownerId, ownerId)))
          await db.insert(syncEntities).values({ ownerId, entity: 'place', entityId: id, revision: currentRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, updatedAt: new Date() } })
        }
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'taxonomy.upsert' && mutation.entity === 'person' && Object.hasOwn(mutation.values, 'note')) {
      const id = mutation.id!, value = personNote(mutation.values.note as string | null)
      const [current] = await db.select().from(people).where(and(eq(people.id, id), eq(people.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'person'), eq(syncEntities.entityId, id))).limit(1)
      const currentRevision = state?.revision ?? 1
      if (!current || state?.deletedAt || (personNote(current.note) !== value && personNote(current.note) !== personNote(mutation.base!.note as string | null))) {
        response = { operationId, outcome: 'conflict', conflict: { entity: 'person', id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['note'] } }
      } else {
        if (personNote(current.note) !== value) {
          await db.update(people).set({ note: value, updatedAt: new Date() }).where(and(eq(people.id, id), eq(people.ownerId, ownerId)))
          await db.insert(syncEntities).values({ ownerId, entity: 'person', entityId: id, revision: currentRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, updatedAt: new Date() } })
        }
        response = { operationId, outcome: 'applied' }
      }
    } else if (mutation.type === 'taxonomy.upsert') {
      const rename = mutation as unknown as { entity: 'person' | 'place' | 'occasion'; id: string; baseRevision: number; base: { name: string }; values: { name: string } }
      const table = taxonomyTable[rename.entity]
      const [current] = await db.select().from(table).where(and(eq(table.id, rename.id), eq(table.ownerId, ownerId))).limit(1).for('update')
      const [state] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, rename.entity), eq(syncEntities.entityId, rename.id))).limit(1)
      const currentRevision = state?.revision ?? 1
      const conflict = { entity: rename.entity, id: rename.id, revision: currentRevision, current: current ? { ...current, revision: currentRevision } : null, fields: ['name'] }
      if (!current || state?.deletedAt) response = { operationId, outcome: 'conflict', conflict }
      else if (current.name === rename.values.name.trim()) response = { operationId, outcome: 'applied' }
      else if (current.name !== rename.base.name) response = { operationId, outcome: 'conflict', conflict }
      else {
        const duplicate = await db.select({ id: table.id }).from(table).where(and(eq(table.ownerId, ownerId), sql`lower(${table.name}) = lower(${rename.values.name.trim()})`, sql`${table.id} <> ${rename.id}`)).limit(1)
        if (duplicate.length) response = { operationId, outcome: 'rejected', reason: 'name_taken', conflict } as SyncResponse
        else {
          let renamed = false
          try {
            await db.transaction(async savepoint => {
              await savepoint.update(table).set({ name: rename.values.name.trim() } as never).where(and(eq(table.id, rename.id), eq(table.ownerId, ownerId)))
            })
            renamed = true
          } catch (error) {
            const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
            if (code === '23505') response = { operationId, outcome: 'rejected', reason: 'name_taken', conflict } as SyncResponse
            else throw error
          }
          if (renamed) {
            await db.insert(syncEntities).values({ ownerId, entity: rename.entity, entityId: rename.id, revision: currentRevision + 1 }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: currentRevision + 1, updatedAt: new Date() } })
            response = { operationId, outcome: 'applied' }
          }
        }
      }
    }
    await db.insert(syncOperations).values({ ownerId, operationId, response })
    return response
  })
}
