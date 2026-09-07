import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'

export function shelfEdits(entries: OutboxEntry[], id: string) {
  return entries.filter(entry => entry.mutation.type === 'collection.upsert' && entry.mutation.id === id && Object.hasOwn(entry.mutation.values, 'name')).sort((a, b) => a.sequence - b.sequence)
}

export function projectShelfNames(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const collections = new Map(snapshot.collections.map(row => [row.id, row]))
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
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
