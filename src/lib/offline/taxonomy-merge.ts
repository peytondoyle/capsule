import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'
import { taxonomyDeletionBase } from './taxonomy-delete'

export function occasionMergeBase(snapshot: SyncSnapshot, id: string) {
  const row = snapshot.occasions.find(row => row.id === id)
  const base = taxonomyDeletionBase(snapshot, 'occasion', id)
  return row && base ? { ...base, revision: row.revision } : null
}

export function occasionMerges(entries: OutboxEntry[], id?: string) {
  return entries.filter(entry => entry.mutation.type === 'occasion.merge' && (!id || entry.mutation.id === id || entry.mutation.targetId === id))
}

export function projectOccasionMerges(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  let projected = snapshot
  for (const entry of occasionMerges(entries).sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'occasion.merge') continue
    projected = { ...projected, occasions: projected.occasions.filter(row => row.id !== mutation.id), records: projected.records.map(row => row.occasionId === mutation.id ? { ...row, occasionId: mutation.targetId } : row) }
  }
  return projected
}

export function reviewOccasionMerge(archive: LocalArchive, entries: OutboxEntry[], operationId: string) {
  const entry = entries.find(entry => entry.ownerId === archive.ownerId && entry.operationId === operationId && entry.mutation.type === 'occasion.merge')
  if (!entry || entry.mutation.type !== 'occasion.merge' || !['conflict', 'rejected'].includes(entry.response?.outcome ?? '')) return null
  const source = occasionMergeBase(archive.snapshot, entry.mutation.id), target = occasionMergeBase(archive.snapshot, entry.mutation.targetId)
  const refreshed = archive.refreshedAt > (entry.responseAt ?? Infinity)
  return { entry, source, target, refreshed, token: JSON.stringify({ operationId, source, target, refreshed, response: entry.response }) }
}
