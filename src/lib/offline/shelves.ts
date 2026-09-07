import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'

export function shelfEdits(entries: OutboxEntry[], id: string) {
  return entries.filter(entry => entry.mutation.type === 'collection.upsert' && entry.mutation.id === id && Object.hasOwn(entry.mutation.values, 'name')).sort((a, b) => a.sequence - b.sequence)
}

export function shelfCreations(entries: OutboxEntry[], id?: string) {
  return entries.filter(entry => entry.mutation.type === 'collection.create' && (!id || entry.mutation.id === id))
}

export function projectShelfNames(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const collections = new Map(snapshot.collections.map(row => [row.id, row]))
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
    if (entry.ownerId === snapshot.ownerId && mutation.type === 'collection.reorder') {
      mutation.ids.forEach((id, sortOrder) => { const row = collections.get(id); if (row?.kind === 'shelf') collections.set(id, { ...row, sortOrder }) })
      continue
    }
    if (entry.ownerId === snapshot.ownerId && mutation.type === 'collection.create') {
      const current = collections.get(mutation.id)
      collections.set(mutation.id, { ...(current ?? { id: mutation.id, revision: 1, name: mutation.values.name, kind: 'shelf', sortOrder: 0, impliedTags: [], rule: null, boardX: null, boardY: null, boardW: null, boardH: null, localOnly: true }), pendingCreation: true })
      continue
    }
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'collection.upsert' || !mutation.id || typeof mutation.values.name !== 'string') continue
    const current = collections.get(mutation.id) ?? entry.baseRecord
    if (current) collections.set(mutation.id, { ...current, name: mutation.values.name })
  }
  return { ...snapshot, collections: [...collections.values()] }
}

export function reviewShelfName(archive: LocalArchive, entries: OutboxEntry[], id: string) {
  const edits = shelfEdits(entries.filter(entry => entry.ownerId === archive.ownerId), id)
  const stopped = edits.find(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))
  if (!stopped) return null
  const conflict = stopped.response?.conflict, saved = archive.snapshot.collections.find(row => row.id === id) ?? null
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity) || !conflict || saved && saved.revision > conflict.revision ? saved : conflict.current
  const local = projectShelfNames(archive.snapshot, edits).collections.find(row => row.id === id)
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, revision, rejected: stopped.response?.outcome === 'rejected' || !!remote && remote.kind !== 'shelf', token: JSON.stringify({ ids: edits.map(entry => entry.operationId), remote, revision, response: stopped.response }) }
}

export function shelfOrderRows(snapshot: SyncSnapshot) {
  return snapshot.collections.filter(row => row.kind === 'shelf').sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.id.localeCompare(b.id))
}

export function shelfOrderBase(snapshot: SyncSnapshot) {
  return shelfOrderRows(snapshot).map(row => ({ id: row.id, sortOrder: Number(row.sortOrder ?? 0) })).sort((a, b) => a.id.localeCompare(b.id))
}

export function shelfOrders(entries: OutboxEntry[]) {
  return entries.filter(entry => entry.mutation.type === 'collection.reorder')
}

export function reviewShelfOrder(archive: LocalArchive, entries: OutboxEntry[]) {
  const entry = shelfOrders(entries).find(entry => entry.ownerId === archive.ownerId && ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))
  if (!entry) return null
  const base = shelfOrderBase(archive.snapshot), refreshed = archive.refreshedAt > (entry.responseAt ?? Infinity)
  return { entry, base, refreshed, token: JSON.stringify({ operationId: entry.operationId, base, refreshed, response: entry.response }) }
}

const shelfFields = ['name', 'kind', 'rule', 'boardX', 'boardY', 'boardW', 'boardH', 'impliedTags', 'sortOrder', 'createdAt', 'updatedAt']
export function shelfRemovalBase(row: Record<string, unknown>, links: string[]): { metadata: Record<string, unknown>; links: string[] } {
  return { metadata: Object.fromEntries(shelfFields.map(field => [field, row[field] ?? null])), links: [...links].sort() }
}
export function shelfDeletionBase(snapshot: SyncSnapshot, id: string) {
  const row = snapshot.collections.find(row => row.id === id)
  return row ? shelfRemovalBase(row, snapshot.memberships.filter(link => link.collectionId === id).map(link => `${link.objectId}:${link.sortOrder}`)) : null
}
export function shelfDeletions(entries: OutboxEntry[], id?: string) {
  return entries.filter(entry => entry.mutation.type === 'collection.delete' && (!id || entry.mutation.id === id))
}
export function projectShelfDeletions(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const ids = new Set(shelfDeletions(entries).flatMap(entry => entry.ownerId === snapshot.ownerId && entry.mutation.type === 'collection.delete' ? [entry.mutation.id] : []))
  return { ...snapshot, collections: snapshot.collections.filter(row => !ids.has(row.id)), memberships: snapshot.memberships.filter(row => !ids.has(row.collectionId)) }
}
export function reviewShelfDeletion(archive: LocalArchive, entries: OutboxEntry[], operationId: string) {
  const entry = shelfDeletions(entries).find(entry => entry.ownerId === archive.ownerId && entry.operationId === operationId && ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))
  if (!entry || entry.mutation.type !== 'collection.delete') return null
  const id = entry.mutation.id
  const current = archive.snapshot.collections.find(row => row.id === id) ?? null
  const base = shelfDeletionBase(archive.snapshot, id), refreshed = archive.refreshedAt > (entry.responseAt ?? Infinity)
  return { entry, current, base, refreshed, token: JSON.stringify({ operationId, current, base, refreshed, response: entry.response }) }
}
export function shelfMembershipEdits(entries: OutboxEntry[], id: string) {
  return entries.some(entry => entry.mutation.type === 'object.patch' && Object.hasOwn(entry.mutation.patch.changes, 'inCollections') && [entry.mutation.patch.base.inCollections, entry.mutation.patch.changes.inCollections].some(refs => Array.isArray(refs) && refs.some(ref => ref?.id === id)))
}
