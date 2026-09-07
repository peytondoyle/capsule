import { captureMediaReferences } from '../offline-queue'
import type { SyncMutation, SyncRequest, SyncResponse, SyncSnapshot } from './types'
import { archiveAssets, mediaKey, validSnapshot, referencedMediaKeys, MEDIA_REFERENCE_LOCK } from './media'
import { isLinkField, linkChoices, projectLinks, sameField, type LinkReference } from './links'
import { objectEdits, projectArchive, reviewObject, validObjectChanges } from './edits'
import { personNote, reviewPersonNote, pendingTaxonomyCreator, reviewTaxonomyName, taxonomyEdits, taxonomyKind, taxonomyName, type TaxonomyEntity } from './taxonomy'
import { reviewShelfName, shelfCreations, shelfEdits, shelfOrderBase, shelfOrders, reviewShelfOrder } from './shelves'
import { occasionMergeBase, occasionMerges, reviewOccasionMerge } from './taxonomy-merge'
import { reviewTaxonomyDeletion, taxonomyDeletionBase, taxonomyDeletions } from './taxonomy-delete'

const DATABASE = 'capsule-archive'
const VERSION = 2
type Table = 'archives' | 'outbox' | 'media' | 'preparations'

export type LocalMedia = {
  ownerId: string
  id: string
  bytes: Blob
  name: string
  type: string
  createdAt: number
}

export type OutboxEntry = SyncRequest & {
  ownerId: string
  sequence: number
  createdAt: number
  response?: SyncResponse
  responseAt?: number
  baseRecord?: SyncSnapshot['records'][number]
}

export type LocalArchive = {
  ownerId: string
  snapshot: SyncSnapshot
  refreshedAt: number
  preparedAt: number | null
}

export type ArchivePreparation = { ownerId: string; id: string; snapshot: SyncSnapshot; startedAt: number }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    let blocked = false
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 1) {
        db.createObjectStore('archives', { keyPath: 'ownerId' })
        db.createObjectStore('outbox', { keyPath: ['ownerId', 'operationId'] })
          .createIndex('ownerId', 'ownerId')
        db.createObjectStore('media', { keyPath: ['ownerId', 'id'] })
          .createIndex('ownerId', 'ownerId')
      }
      if (event.oldVersion < 2) db.createObjectStore('preparations', { keyPath: 'ownerId' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (blocked) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other Capsule tabs to update offline storage.'))
    }
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transact<T>(
  tables: Table[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(tables, mode)
      let value: T
      let failure: unknown
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Offline save was interrupted.'))
      void run(tx).then((output) => { value = output }, (error) => {
        failure = error
        try { tx.abort() } catch { reject(error) }
      })
    })
  } finally {
    db.close()
  }
}

export function readArchive(ownerId: string): Promise<LocalArchive | undefined> {
  return transact(['archives'], 'readonly', (tx) => result(tx.objectStore('archives').get(ownerId)))
}

export function readLibrary(ownerId: string) {
  return transact(['archives', 'outbox'], 'readonly', async (tx) => ({
    archive: await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId)),
    operations: (await result<OutboxEntry[]>(tx.objectStore('outbox').index('ownerId').getAll(ownerId))).sort((a, b) => a.sequence - b.sequence),
  }))
}

export function saveObjectChanges(ownerId: string, id: string, expected: Record<string, unknown>, changes: Record<string, unknown>) {
  if (!validObjectChanges(changes)) return Promise.reject(new Error('Check the title, date, and details before saving.'))
  return transact(['archives', 'outbox'], 'readwrite', async (tx) => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before editing it offline.')
    const outbox = tx.objectStore('outbox')
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (objectEdits(entries, id).some((entry) => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))) throw new Error('Review the conflicting changes before editing this object again.')
    const projected = projectArchive(archive.snapshot, entries)
    const current = projected.records.find((record) => record.id === id)
    if (!current) throw new Error('This object is no longer in the saved archive.')
    const fields = Object.keys(changes)
    if (!fields.length) return
    if (fields.some((field) => !sameField(field, current[field], expected[field]))) throw new Error('These details changed in another tab. Keep your text and reopen the object before saving.')
    for (const [field, rows] of [['placeId', projected.places], ['occasionId', projected.occasions]] as const) {
      const saved = archive.snapshot[field === 'placeId' ? 'places' : 'occasions']
      if (changes[field] && (!rows.some(row => row.id === changes[field]) || !saved.some(row => row.id === changes[field]))) throw new Error('Choose a place or occasion from this archive.')
    }
    for (const field of fields) if (isLinkField(field)) {
      const choices = linkChoices(projected, field)
      if (field === 'inCollections' && (changes[field] as LinkReference[]).some(ref => shelfCreations(entries, ref.id).length)) throw new Error('Sync this new shelf before adding objects to it.')
      const entity = field === 'atPlace' ? 'place' : field === 'onOccasion' ? 'occasion' : ['givenBy', 'depicted', 'mentioned'].includes(field) ? 'person' : null
      if (entity === 'occasion' && (changes[field] as LinkReference[]).some(ref => occasionMerges(entries).some(entry => entry.mutation.type === 'occasion.merge' && entry.mutation.id === ref.id))) throw new Error('This occasion is being merged. Choose its destination instead.')
      if (entity && (changes[field] as LinkReference[]).some(ref => taxonomyDeletions(entries).some(entry => entry.mutation.type === 'taxonomy.delete' && entry.mutation.entity === entity && entry.mutation.id === ref.id) || archive.snapshot.tombstones.some(row => row.entity === entity && row.id === ref.id))) throw new Error('This entry was removed. Choose another name or create a new entry.')
      if ((changes[field] as LinkReference[]).some(ref => !ref.create && !choices.some(choice => choice.id === ref.id))) throw new Error('Choose people, tags, and collections from this archive or add a new name.')
    }
    const entry: OutboxEntry = {
      ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1,
      createdAt: Date.now(), baseRecord: current,
      mutation: { type: 'object.patch', patch: { id, baseRevision: current.revision, base: Object.fromEntries(fields.map((field) => [field, current[field]])), changes } },
    }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolveObjectChanges(ownerId: string, id: string, token: string, choices: Record<string, 'local' | 'remote'>, discard = false) {
  return transact(['archives', 'outbox'], 'readwrite', async (tx) => {
    const archives = tx.objectStore('archives'), outbox = tx.objectStore('outbox')
    const archive = await result<LocalArchive | undefined>(archives.get(ownerId))
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewObject(archive, entries, id)
    if (!review || review.token !== token) throw new Error('These changes were updated in another tab. Reopen the review before choosing.')
    if (!discard && (!review.remote || review.rejected || !review.local)) throw new Error('Save a copy of your local details before discarding this unavailable object’s changes.')
    const changes: Record<string, unknown> = {}
    if (!discard) for (const field of review.fields) {
      if (choices[field] !== 'local' && choices[field] !== 'remote') throw new Error('Choose which version to keep for each field.')
      if (choices[field] === 'local' && !sameField(field, review.local![field], review.remote![field])) changes[field] = review.local![field]
    }
    if (!validObjectChanges(changes)) throw new Error('These local details cannot be synced. Save a copy before discarding them.')
    for (const entry of review.edits) await result(outbox.delete([ownerId, entry.operationId]))
    if (Object.keys(changes).length) {
      const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: Math.min(...review.edits.map((item) => item.sequence)), createdAt: Date.now(), baseRecord: { ...review.remote!, id, revision: review.revision }, mutation: { type: 'object.patch', patch: { id, baseRevision: review.revision, base: Object.fromEntries(Object.keys(changes).map((field) => [field, review.remote![field]])), changes } } }
      await result(outbox.add(entry))
    }
    if (review.remote) {
      const record = { ...review.remote, id, revision: review.revision }
      await result(archives.put({ ...archive, snapshot: projectLinks({ ...archive.snapshot, records: [...archive.snapshot.records.filter((row) => row.id !== id), record] }) }))
    } else if (!review.rejected) {
      await result(archives.put({ ...archive, snapshot: { ...archive.snapshot, records: archive.snapshot.records.filter((row) => row.id !== id) } }))
    }
  })
}

export function listOperations(ownerId: string): Promise<OutboxEntry[]> {
  return transact(['outbox'], 'readonly', async (tx) => {
    const entries = await result<OutboxEntry[]>(tx.objectStore('outbox').index('ownerId').getAll(ownerId))
    return entries.sort((a, b) => a.sequence - b.sequence)
  })
}

function assertAvailableName(snapshot: SyncSnapshot, entity: TaxonomyEntity, id: string, name: string) {
  if (snapshot[taxonomyKind[entity]].some(row => row.id !== id && typeof row.name === 'string' && row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('That name already exists in this archive. Choose a different name.')
}

export function saveTaxonomyName(ownerId: string, entity: TaxonomyEntity, id: string, expectedName: string, name: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const value = taxonomyName(name)
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before renaming its entries offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (entity === 'occasion' && occasionMerges(entries, id).length) throw new Error('Sync or review this occasion’s saved merge first.')
    if (taxonomyEdits(entries, entity, id, 'name').some(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))) throw new Error('Review this name’s conflicting changes before renaming it again.')
    const projected = projectArchive(archive.snapshot, entries), current = projected[taxonomyKind[entity]].find(row => row.id === id)
    if (!current || (!archive.snapshot[taxonomyKind[entity]].some(row => row.id === id) && !(current.localOnly && pendingTaxonomyCreator(entries, entity, id)))) throw new Error('Sync this entry before renaming it, or refresh if it was removed.')
    if (current.name !== expectedName) throw new Error('This name changed in another tab. Keep your text and reopen the entry before saving.')
    assertAvailableName(projected, entity, id, value)
    if (current.name === value) return
    const entry: OutboxEntry = {
      ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1,
      createdAt: Date.now(), baseRecord: current,
      mutation: { type: 'taxonomy.upsert', entity, id, baseRevision: current.revision, base: { name: String(current.name) }, values: { name: value } },
    }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolveTaxonomyName(ownerId: string, entity: TaxonomyEntity, id: string, token: string, name: string | null) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archives = tx.objectStore('archives'), outbox = tx.objectStore('outbox')
    const archive = await result<LocalArchive | undefined>(archives.get(ownerId))
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewTaxonomyName(archive, entries, entity, id)
    if (!review || review.token !== token) throw new Error('This name review changed in another tab. Reopen it before choosing.')
    if (name !== null && !review.remote) throw new Error('This entry was deleted. Its name cannot be restored from this review.')
    const kind = taxonomyKind[entity], snapshot = { ...archive.snapshot, [kind]: review.remote ? [...archive.snapshot[kind].filter(row => row.id !== id), { ...review.remote, id, revision: review.revision }] : archive.snapshot[kind].filter(row => row.id !== id) }
    const value = name === null ? null : taxonomyName(name)
    const remaining = entries.filter(entry => !review.edits.some(edit => edit.operationId === entry.operationId))
    if (value !== null) assertAvailableName(projectArchive(snapshot, remaining), entity, id, value)
    for (const entry of review.edits) await result(outbox.delete([ownerId, entry.operationId]))
    if (value !== null && value !== review.remote?.name) {
      const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: Math.min(...review.edits.map(entry => entry.sequence)), createdAt: Date.now(), baseRecord: { ...review.remote!, id, revision: review.revision }, mutation: { type: 'taxonomy.upsert', entity, id, baseRevision: review.revision, base: { name: String(review.remote!.name) }, values: { name: value } } }
      await result(outbox.add(entry))
    }
    await result(archives.put({ ...archive, snapshot }))
  })
}

export function savePersonNote(ownerId: string, id: string, expectedNote: string | null, note: string | null) {
  const value = personNote(note)
  if (value && value.length > 20000) return Promise.reject(new Error('Keep the note to 20,000 characters or fewer.'))
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before editing notes offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (taxonomyEdits(entries, 'person', id, 'note').some(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))) throw new Error('Review this note’s conflicting changes before editing it again.')
    const current = projectArchive(archive.snapshot, entries).people.find(row => row.id === id)
    if (!current || current.localOnly || !archive.snapshot.people.some(row => row.id === id) || archive.snapshot.tombstones.some(row => row.entity === 'person' && row.id === id)) throw new Error('Sync this person before editing their note, or refresh if they were removed.')
    if (personNote(current.note as string | null) !== personNote(expectedNote)) throw new Error('This note changed in another tab. Keep your text and reopen the person before saving.')
    if (personNote(current.note as string | null) === value) return
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), baseRecord: current, mutation: { type: 'taxonomy.upsert', entity: 'person', id, baseRevision: current.revision, base: { note: personNote(current.note as string | null) }, values: { note: value } } }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolvePersonNote(ownerId: string, id: string, token: string, choice: { note: string | null } | { discard: true }) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archives = tx.objectStore('archives'), outbox = tx.objectStore('outbox')
    const archive = await result<LocalArchive | undefined>(archives.get(ownerId))
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewPersonNote(archive, entries, id)
    if (!review || review.token !== token) throw new Error('This note review changed in another tab. Reopen it before choosing.')
    const discard = 'discard' in choice, value = 'note' in choice ? personNote(choice.note) : null
    if (!discard && (!review.remote || review.rejected)) throw new Error('This note cannot be retried. Save your local text before discarding the change.')
    if (value && value.length > 20000) throw new Error('Keep the note to 20,000 characters or fewer.')
    const snapshot = { ...archive.snapshot, people: review.remote ? [...archive.snapshot.people.filter(row => row.id !== id), { ...review.remote, id, revision: review.revision }] : archive.snapshot.people.filter(row => row.id !== id) }
    for (const entry of review.edits) await result(outbox.delete([ownerId, entry.operationId]))
    if (!discard && value !== personNote(review.remote!.note as string | null)) {
      const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: Math.min(...review.edits.map(entry => entry.sequence)), createdAt: Date.now(), baseRecord: { ...review.remote!, id, revision: review.revision }, mutation: { type: 'taxonomy.upsert', entity: 'person', id, baseRevision: review.revision, base: { note: personNote(review.remote!.note as string | null) }, values: { note: value } } }
      await result(outbox.add(entry))
    }
    await result(archives.put({ ...archive, snapshot }))
  })
}

export function saveShelfOrder(ownerId: string, expected: string, ids: string[]) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before arranging shelves offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const snapshot = projectArchive(archive.snapshot, entries), base = shelfOrderBase(snapshot)
    if (shelfOrders(entries).length || snapshot.collections.some(row => row.kind === 'shelf' && (row.localOnly || row.pendingCreation))) throw new Error('Sync or review the saved shelf changes before arranging shelves.')
    if (JSON.stringify(base) !== expected) throw new Error('The shelf order changed in another tab. Reopen the order editor.')
    if (ids.length < 2 || ids.length !== base.length || new Set(ids).size !== ids.length || ids.some(id => !base.some(row => row.id === id))) throw new Error('Choose the saved manual shelves in this archive.')
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), mutation: { type: 'collection.reorder', base, ids } }
    await result(outbox.add(entry))
    return entry
  })
}

export function discardShelfOrder(ownerId: string, token: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const review = archive && reviewShelfOrder(archive, entries)
    if (!review || !review.refreshed || review.token !== token) throw new Error('Refresh the archive and reopen the order review before keeping its order.')
    await result(outbox.delete([ownerId, review.entry.operationId]))
  })
}

export function createShelf(ownerId: string, name: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const value = taxonomyName(name)
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before creating shelves offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), mutation: { type: 'collection.create', id: crypto.randomUUID(), values: { name: value } } }
    await result(outbox.add(entry))
    return entry
  })
}

export function discardShelfCreation(ownerId: string, operationId: string) {
  return transact(['outbox'], 'readwrite', async tx => {
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const entry = entries.find(entry => entry.operationId === operationId)
    if (!entry || entry.mutation.type !== 'collection.create' || entry.response?.outcome !== 'rejected') throw new Error('This shelf creation changed. Reopen it before discarding.')
    const id = entry.mutation.id
    if (entries.some(other => other.operationId !== operationId && (other.mutation.type === 'collection.upsert' && other.mutation.id === id || other.mutation.type === 'object.patch' && Array.isArray(other.mutation.patch.changes.inCollections) && other.mutation.patch.changes.inCollections.some(ref => ref?.id === id)))) throw new Error('Pending edits still use this shelf. Save your pending work before resolving those edits.')
    await result(outbox.delete([ownerId, operationId]))
  })
}

export function saveShelfName(ownerId: string, id: string, expectedName: string, name: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const value = taxonomyName(name)
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before renaming its shelves offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (shelfEdits(entries, id).some(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))) throw new Error('Review this shelf’s conflicting name before renaming it again.')
    const current = projectArchive(archive.snapshot, entries).collections.find(row => row.id === id)
    if (!current || current.localOnly || current.pendingCreation || current.kind !== 'shelf' || !archive.snapshot.collections.some(row => row.id === id) || archive.snapshot.tombstones.some(row => row.entity === 'collection' && row.id === id)) throw new Error('Choose a shelf already saved in the archive.')
    if (current.name !== expectedName) throw new Error('This shelf name changed in another tab. Keep your text and reopen it before saving.')
    if (current.name === value) return
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), baseRecord: current, mutation: { type: 'collection.upsert', id, baseRevision: current.revision, base: { name: current.name }, values: { name: value } } }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolveShelfName(ownerId: string, id: string, token: string, name: string | null) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archives = tx.objectStore('archives'), outbox = tx.objectStore('outbox')
    const archive = await result<LocalArchive | undefined>(archives.get(ownerId))
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewShelfName(archive, entries, id)
    if (!review || review.token !== token) throw new Error('This shelf name review changed in another tab. Reopen it before choosing.')
    if (name !== null && (!review.remote || review.rejected)) throw new Error('This shelf cannot be renamed from this review. Save your local name before discarding it.')
    const value = name === null ? null : taxonomyName(name)
    const snapshot = { ...archive.snapshot, collections: review.remote ? [...archive.snapshot.collections.filter(row => row.id !== id), { ...review.remote, id, revision: review.revision }] : archive.snapshot.collections.filter(row => row.id !== id) }
    for (const entry of review.edits) await result(outbox.delete([ownerId, entry.operationId]))
    if (value !== null && value !== review.remote!.name) {
      const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: Math.min(...review.edits.map(entry => entry.sequence)), createdAt: Date.now(), baseRecord: { ...review.remote!, id, revision: review.revision }, mutation: { type: 'collection.upsert', id, baseRevision: review.revision, base: { name: review.remote!.name }, values: { name: value } } }
      await result(outbox.add(entry))
    }
    await result(archives.put({ ...archive, snapshot }))
  })
}

function assertMergeEntries(archive: LocalArchive, entries: OutboxEntry[], id: string, targetId: string) {
  if (id === targetId) throw new Error('Choose a different destination occasion.')
  for (const key of [id, targetId]) {
    const row = archive.snapshot.occasions.find(row => row.id === key)
    if (!row || row.localOnly || archive.snapshot.tombstones.some(row => row.entity === 'occasion' && row.id === key)) throw new Error('Choose two occasions already saved in the archive.')
    if (taxonomyEdits(entries, 'occasion', key).length || occasionMerges(entries, key).length || taxonomyDeletions(entries).some(entry => entry.mutation.type === 'taxonomy.delete' && entry.mutation.entity === 'occasion' && entry.mutation.id === key)) throw new Error('Sync or review these occasions’ saved changes before merging.')
  }
}

export function saveOccasionMerge(ownerId: string, id: string, targetId: string, expected: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before merging occasions offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    assertMergeEntries(archive, entries, id, targetId)
    const snapshot = projectArchive(archive.snapshot, entries)
    const base = { source: occasionMergeBase(snapshot, id)!, target: occasionMergeBase(snapshot, targetId)! }
    if (JSON.stringify(base) !== expected) throw new Error('These occasions or their links changed in another tab. Reopen the merge before confirming.')
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), baseRecord: snapshot.occasions.find(row => row.id === id), mutation: { type: 'occasion.merge', id, targetId, base } }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolveOccasionMerge(ownerId: string, operationId: string, token: string, merge: boolean) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewOccasionMerge(archive, entries, operationId)
    if (!review || review.token !== token || review.entry.mutation.type !== 'occasion.merge') throw new Error('This merge review changed in another tab. Reopen it before choosing.')
    if (!review.refreshed) throw new Error('Sync saved edits to refresh both occasions before reviewing this merge.')
    if (merge) {
      if (review.entry.response?.outcome !== 'conflict' || !review.source || !review.target) throw new Error('This merge cannot be retried. Keep the archive entries and choose again.')
      assertMergeEntries(archive, entries.filter(entry => entry.operationId !== operationId), review.entry.mutation.id, review.entry.mutation.targetId)
    }
    await result(outbox.delete([ownerId, operationId]))
    if (merge) await result(outbox.add({ ...review.entry, operationId: crypto.randomUUID(), createdAt: Date.now(), response: undefined, responseAt: undefined, mutation: { ...review.entry.mutation, base: { source: review.source!, target: review.target! } } }))
  })
}

export function saveTaxonomyDeletion(ownerId: string, entity: TaxonomyEntity, id: string, expected: string) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (!archive) throw new Error('Prepare this archive before removing its entries offline.')
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (entity === 'occasion' && occasionMerges(entries, id).length) throw new Error('Sync or review this occasion’s saved merge first.')
    if (taxonomyEdits(entries, entity, id).length) throw new Error('Sync or review this entry’s saved changes before removing it.')
    const snapshot = projectArchive(archive.snapshot, entries), current = snapshot[taxonomyKind[entity]].find(row => row.id === id)
    if (!current || current.localOnly || !archive.snapshot[taxonomyKind[entity]].some(row => row.id === id)) throw new Error('Sync this entry before removing it, or refresh if it was already removed.')
    const base = taxonomyDeletionBase(snapshot, entity, id)!
    if (JSON.stringify(base) !== expected) throw new Error('This entry or its links changed in another tab. Reopen the removal before confirming.')
    const entry: OutboxEntry = { ownerId, operationId: crypto.randomUUID(), sequence: entries.reduce((max, item) => Math.max(max, item.sequence), 0) + 1, createdAt: Date.now(), baseRecord: current, mutation: { type: 'taxonomy.delete', entity, id, baseRevision: current.revision, base } }
    await result(outbox.add(entry))
    return entry
  })
}

export function resolveTaxonomyDeletion(ownerId: string, operationId: string, token: string, remove: boolean) {
  return transact(['archives', 'outbox'], 'readwrite', async tx => {
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    const outbox = tx.objectStore('outbox'), entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    if (!archive) throw new Error('The local archive could not be found.')
    const review = reviewTaxonomyDeletion(archive, entries, operationId)
    if (!review || review.token !== token) throw new Error('This removal review changed in another tab. Reopen it before choosing.')
    if (!review.refreshed) throw new Error('Sync saved edits to refresh the archive before reviewing this removal.')
    if (remove && (!review.current || !review.base || review.entry.response?.outcome === 'rejected')) throw new Error('This removal cannot be retried. Keep the archive version and reopen the entry.')
    await result(outbox.delete([ownerId, operationId]))
    if (remove && review.entry.mutation.type === 'taxonomy.delete') {
      const entry: OutboxEntry = { ...review.entry, operationId: crypto.randomUUID(), createdAt: Date.now(), response: undefined, responseAt: undefined, baseRecord: review.current!, mutation: { ...review.entry.mutation, baseRevision: review.current!.revision, base: review.base! } }
      await result(outbox.add(entry))
    }
  })
}

// The operation is the local edit: readers overlay this durable log on the snapshot.
export function saveOperation(ownerId: string, mutation: SyncMutation, media: Omit<LocalMedia, 'ownerId'>[] = []) {
  const operationId = crypto.randomUUID()
  return transact(['outbox', 'media'], 'readwrite', async (tx) => {
    const outbox = tx.objectStore('outbox')
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const sequence = entries.reduce((last, entry) => Math.max(last, entry.sequence), 0) + 1
    const entry: OutboxEntry = { ownerId, operationId, mutation, sequence, createdAt: Date.now() }
    await result(outbox.add(entry))
    for (const item of media) await result(tx.objectStore('media').put({ ...item, ownerId }))
    return entry
  })
}

export function recordResponse(ownerId: string, response: SyncResponse) {
  return transact(['archives', 'outbox'], 'readwrite', async (tx) => {
    const store = tx.objectStore('outbox')
    const entry = await result<OutboxEntry | undefined>(store.get([ownerId, response.operationId]))
    const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
    if (entry) await result(store.put({ ...entry, response, responseAt: Math.max(Date.now(), archive?.refreshedAt ?? 0) }))
  })
}

export function replaceSnapshot(ownerId: string, snapshot: SyncSnapshot, confirmedOperationIds: string[] = []) {
  if (snapshot.ownerId !== ownerId) return Promise.reject(new Error('This archive belongs to another account.'))
  return transact(['archives', 'outbox', 'media'], 'readwrite', async (tx) => {
    const archives = tx.objectStore('archives')
    const previous = await result<LocalArchive | undefined>(archives.get(ownerId))
    let preparedAt: number | null = null
    if (previous?.preparedAt && validSnapshot(snapshot, ownerId)) {
      let complete = true
      for (const asset of archiveAssets(snapshot)) {
        const media = await result<LocalMedia | undefined>(tx.objectStore('media').get([ownerId, mediaKey(asset.source)]))
        if (!media?.bytes.size) { complete = false; break }
      }
      if (complete) preparedAt = Date.now()
    }
    const outbox = tx.objectStore('outbox')
    const entries = await result<OutboxEntry[]>(outbox.index('ownerId').getAll(ownerId))
    const refreshedAt = entries.reduce((latest, entry) => Math.max(latest, (entry.responseAt ?? 0) + 1), Date.now())
    await result(archives.put({ ownerId, snapshot, refreshedAt, preparedAt }))
    for (const id of confirmedOperationIds) {
      const entry = await result<OutboxEntry | undefined>(outbox.get([ownerId, id]))
      if (entry?.response?.outcome === 'applied' || entry?.response?.outcome === 'duplicate') {
        await result(outbox.delete([ownerId, id]))
      }
    }
  })
}

export function readMedia(ownerId: string, id: string): Promise<LocalMedia | undefined> {
  return transact(['media'], 'readonly', (tx) => result(tx.objectStore('media').get([ownerId, id])))
}

export function readPreparation(ownerId: string): Promise<ArchivePreparation | undefined> {
  return transact(['preparations'], 'readonly', (tx) => result(tx.objectStore('preparations').get(ownerId)))
}

export function beginPreparation(ownerId: string, snapshot: SyncSnapshot) {
  if (!validSnapshot(snapshot, ownerId)) return Promise.reject(new Error('The archive response is incomplete or belongs to another account.'))
  const preparation: ArchivePreparation = { ownerId, id: crypto.randomUUID(), snapshot, startedAt: Date.now() }
  return transact(['preparations'], 'readwrite', async (tx) => {
    await result(tx.objectStore('preparations').put(preparation))
    return preparation
  })
}

export function saveArchiveMedia(ownerId: string, source: string, bytes: Blob) {
  if (!bytes.size) return Promise.reject(new Error('The archive returned an empty photograph.'))
  const media: LocalMedia = { ownerId, id: mediaKey(source), bytes, type: bytes.type, name: new URL(source).pathname.split('/').pop() || 'photograph', createdAt: Date.now() }
  return transact(['media'], 'readwrite', (tx) => result(tx.objectStore('media').put(media)))
}

export function mediaAvailability(ownerId: string, snapshot: SyncSnapshot) {
  return transact(['media'], 'readonly', async (tx) => {
    const assets = archiveAssets(snapshot)
    let saved = 0
    let bytes = 0
    for (const asset of assets) {
      const media = await result<LocalMedia | undefined>(tx.objectStore('media').get([ownerId, mediaKey(asset.source)]))
      if (media?.bytes.size) { saved++; bytes += media.bytes.size }
    }
    return { saved, total: assets.length, bytes }
  })
}

export function finishPreparation(ownerId: string, id: string) {
  return transact(['preparations', 'archives', 'media'], 'readwrite', async (tx) => {
    const preparation = await result<ArchivePreparation | undefined>(tx.objectStore('preparations').get(ownerId))
    if (!preparation || preparation.id !== id) throw new Error('Another preparation replaced this one. Reopen the archive to refresh.')
    for (const asset of archiveAssets(preparation.snapshot)) {
      const media = await result<LocalMedia | undefined>(tx.objectStore('media').get([ownerId, mediaKey(asset.source)]))
      if (!media?.bytes.size) throw new Error('Some photographs are still missing. Resume preparation when connected.')
    }
    const now = Date.now()
    const archive: LocalArchive = { ownerId, snapshot: preparation.snapshot, refreshedAt: now, preparedAt: now }
    await result(tx.objectStore('archives').put(archive))
    await result(tx.objectStore('preparations').delete(ownerId))
    return archive
  })
}

// Includes original bytes and pending operations; JSON alone would silently discard Blobs.
export function exportPending(ownerId: string) {
  return transact(['archives', 'outbox', 'media'], 'readonly', async (tx) => ({
    archive: await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId)),
    operations: await result<OutboxEntry[]>(tx.objectStore('outbox').index('ownerId').getAll(ownerId)),
    media: await result<LocalMedia[]>(tx.objectStore('media').index('ownerId').getAll(ownerId)),
  }))
}

export async function reclaimArchiveMedia(ownerId: string, isActiveOwner: () => boolean) {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Open Capsule in a browser with safe local storage locking to free unused files.')
  return navigator.locks.request(MEDIA_REFERENCE_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) return { status: 'busy' as const }
    const active = () => { if (!isActiveOwner()) throw new Error('Local cleanup paused. Reopen this account to continue.') }
    active()
    const captures = await captureMediaReferences(ownerId)
    active()
    return transact(['archives', 'preparations', 'outbox', 'media'], 'readwrite', async tx => {
      const archive = await result<LocalArchive | undefined>(tx.objectStore('archives').get(ownerId))
      const preparation = await result<ArchivePreparation | undefined>(tx.objectStore('preparations').get(ownerId))
      if (!archive || !validSnapshot(archive.snapshot, ownerId) || (preparation && !validSnapshot(preparation.snapshot, ownerId))) throw new Error('Prepare this archive before freeing unused local files.')
      const operations = await result<OutboxEntry[]>(tx.objectStore('outbox').index('ownerId').getAll(ownerId))
      const references = referencedMediaKeys([archive.snapshot, preparation?.snapshot, operations, captures])
      const media = tx.objectStore('media'), files = await result<LocalMedia[]>(media.index('ownerId').getAll(ownerId))
      let removed = 0, bytes = 0
      for (const file of files) {
        active()
        if (!file.id.startsWith('remote:') || references.has(file.id)) continue
        await result(media.delete([ownerId, file.id]))
        removed++; bytes += file.bytes.size
      }
      active()
      return { status: 'reclaimed' as const, removed, bytes, retained: files.length - removed }
    })
  })
}
