import type { SyncMutation, SyncRequest, SyncResponse, SyncSnapshot } from './types'
import { archiveAssets, mediaKey, validSnapshot } from './media'
import { isLinkField, linkChoices, projectLinks, sameField, type LinkReference } from './links'
import { objectEdits, projectArchive, reviewObject, validObjectChanges } from './edits'
import { reviewTaxonomyName, taxonomyEdits, taxonomyKind, taxonomyName, type TaxonomyEntity } from './taxonomy'

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
    for (const [field, rows] of [['placeId', archive.snapshot.places], ['occasionId', archive.snapshot.occasions]] as const) {
      if (changes[field] && !rows.some((row) => row.id === changes[field])) throw new Error('Choose a place or occasion from this archive.')
    }
    for (const field of fields) if (isLinkField(field)) {
      const choices = linkChoices(projected, field)
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
    if (taxonomyEdits(entries, entity, id).some(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))) throw new Error('Review this name’s conflicting changes before renaming it again.')
    const projected = projectArchive(archive.snapshot, entries), current = projected[taxonomyKind[entity]].find(row => row.id === id)
    if (!current || !archive.snapshot[taxonomyKind[entity]].some(row => row.id === id) || current.localOnly) throw new Error('Sync this entry before renaming it, or refresh if it was removed.')
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
  return transact(['outbox'], 'readwrite', async (tx) => {
    const store = tx.objectStore('outbox')
    const entry = await result<OutboxEntry | undefined>(store.get([ownerId, response.operationId]))
    if (entry) await result(store.put({ ...entry, response, responseAt: Date.now() }))
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
    await result(archives.put({ ownerId, snapshot, refreshedAt: Date.now(), preparedAt }))
    const outbox = tx.objectStore('outbox')
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
